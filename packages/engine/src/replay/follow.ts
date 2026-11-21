import type { Track } from '../track/types.ts';
import type { CameraPath } from './camera.ts';
import { projectTrack } from './project.ts';
import type { Timeline } from './timeline.ts';
import { trackArea, type View } from './view.ts';

/** The fastest the map may scroll, in frame widths per second of video. */
const PAN_RATE = 0.3;
/**
 * The same for a single activity, which is squeezed into a short clip: a slower scroll
 * would keep it at nearly the whole-route view.
 */
const SINGLE_PAN_RATE = 0.45;
/** The closest the camera gets: the track area is never narrower than this many metres. */
const MIN_SPAN_M = 1500;
/** Standard deviation, in seconds, of the Gaussian that smooths the camera's position. */
const SMOOTHING_S = 1;
/** How far the head may stray from the middle, as a share of the way to the frame's edge. */
const LEASH = 0.6;
/** Seconds at the end over which the camera pulls back to show the whole route. */
const PULL_BACK_S = 2;
/** Standard deviation, in seconds, of the Gaussian that eases the zoom between tracks. */
const ZOOM_SMOOTHING_S = 0.6;
/** A jump between tracks at least this share of the frame's width on screen gets a glide. */
const GLIDE_JUMP = 0.25;

/**
 * Whether a timeline can be followed: its activities are drawn one after another, and most
 * of them long enough for the camera to settle on each. Otherwise the follow camera would
 * jump from one activity to the next every few frames.
 */
export function canFollow(timeline: Timeline, minSeconds: number): boolean {
  const windows = timeline.windows;
  if (timeline.mode === 'race' || !windows?.length) return false;
  const durations = windows.map((window) => window.duration).sort((a, b) => a - b);
  return durations[Math.floor(durations.length / 2)] >= minSeconds;
}

/** The largest zoom at which the track area still spans `minSpanM` metres. */
function closestZoom(view: View, minSpanM: number): number {
  const area = trackArea(view.width, view.height);
  const mercY = (area.y + area.h / 2 - view.offY) / view.scale;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * mercY)));
  const metresPerPx = (40075016.686 * Math.cos(lat)) / view.scale;
  return Math.min(64, Math.max(1, (area.w * metresPerPx) / minSpanM));
}

/** `src` smoothed with a Gaussian of standard deviation `sigma` samples; ends held. */
function gaussianBlur(src: Float64Array, sigma: number): Float64Array {
  const n = src.length;
  const radius = Math.ceil(3 * sigma);
  const kernel = Array.from({ length: 2 * radius + 1 }, (_, j) =>
    Math.exp(-((j - radius) ** 2) / (2 * sigma * sigma)),
  );
  const kernelSum = kernel.reduce((x, y) => x + y, 0);
  return src.map((_, f) => {
    let sum = 0;
    for (let j = -radius; j <= radius; j++)
      sum += kernel[j + radius] * src[Math.min(n - 1, Math.max(0, f + j))];
    return sum / kernelSum;
  });
}

/**
 * A camera that stays close on the moving head of the route and pulls back to the whole
 * route at the end. With several activities drawn one after another, it follows each in
 * turn: where the next one starts far from where the last one ended, it glides there,
 * zooming out far enough to show both places and back in.
 *
 * Planned for the whole video at once. The head's position on every frame is smoothed with
 * a Gaussian, which is symmetric in time, so at a steady pace the camera is centred on the
 * head instead of trailing it; each stretch between glides is smoothed on its own, so the
 * camera never drifts towards the next activity before the glide. Where the head turns
 * faster than the smoothing allows, the path is pulled towards it until the head stays
 * within `LEASH` of the middle. Each followed track gets the zoom at which the map never
 * scrolls faster than `PAN_RATE` (`SINGLE_PAN_RATE` for one track) frame widths per second, rounded down to a power of two
 * from 2x up; between tracks the zoom eases from one to the next, starting early enough
 * never to be closer than allowed.
 *
 * Activities drawn at the same time cannot be followed: on a race timeline this throws.
 */
export function followRouteCamera(
  tracks: Pick<Track, 'points'>[],
  timeline: Timeline,
  view: View,
  fps: number,
): CameraPath {
  if (timeline.mode === 'race')
    throw new Error('The follow camera needs activities drawn one after another');
  const frames = Math.round(timeline.duration * fps);
  const area = trackArea(view.width, view.height);
  const centreX = area.x + area.w / 2;
  const centreY = area.y + area.h / 2;
  const sigma = Math.max(1, SMOOTHING_S * fps);
  const panRate = tracks.length === 1 ? SINGLE_PAN_RATE : PAN_RATE;

  // Where the head is on every frame, in base-view pixels, and whose head it is: the track
  // that started last among those under way.
  const projected = tracks.map((track) => ({ ...projectTrack(track, view, 0.5), idx: 0 }));
  const hx = new Float64Array(frames);
  const hy = new Float64Array(frames);
  const followed = new Int32Array(frames).fill(-1);
  let drawEnd = 0;
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    let k = -1;
    for (let j = 0; j < projected.length; j++) if (timeline.progress(j, t) > 0) k = j;
    if (k < 0) continue; // before anything is drawn; filled in below
    followed[f] = k;
    const progress = timeline.progress(k, t);
    if (progress < 1) drawEnd = f;
    const tr = projected[k];
    while (tr.idx + 1 < tr.count && tr.u[tr.idx + 1] <= progress) tr.idx++;
    const i = tr.idx;
    const j = Math.min(i + 1, tr.count - 1);
    const span = tr.u[j] - tr.u[i];
    const a = span > 0 ? Math.min(1, Math.max(0, (progress - tr.u[i]) / span)) : 0;
    hx[f] = tr.xy[i * 2] + a * (tr.xy[j * 2] - tr.xy[i * 2]);
    hy[f] = tr.xy[i * 2 + 1] + a * (tr.xy[j * 2 + 1] - tr.xy[i * 2 + 1]);
  }
  const drawStart = followed.findIndex((k) => k >= 0);
  if (drawStart < 0) throw new Error('The timeline never shows any track');
  hx.fill(hx[drawStart], 0, drawStart);
  hy.fill(hy[drawStart], 0, drawStart);
  followed.fill(followed[drawStart], 0, drawStart);

  // Stretches of frames that follow one track: [first frame, frame after the last].
  const changes: number[] = [];
  for (let f = 1; f < frames; f++) if (followed[f] !== followed[f - 1]) changes.push(f);
  const smoothStretches = (cuts: number[]) => {
    const bounds = [0, ...cuts, frames];
    const cx = new Float64Array(frames);
    const cy = new Float64Array(frames);
    for (let b = 0; b + 1 < bounds.length; b++) {
      cx.set(gaussianBlur(hx.subarray(bounds[b], bounds[b + 1]), sigma), bounds[b]);
      cy.set(gaussianBlur(hy.subarray(bounds[b], bounds[b + 1]), sigma), bounds[b]);
    }
    return { cx, cy };
  };

  // The zoom, per track followed: its smoothed path's speed (95th percentile, so a single
  // burst does not decide it) may scroll the map by at most `panRate` frame widths per
  // second; from 2x up it is rounded down to a power of two. Measured with every stretch
  // smoothed on its own, so the jumps between tracks do not count. On a short stretch the
  // smoothing flattens the speed to almost nothing, so it is never taken as slower than
  // the head's straight-line speed from the stretch's start to its end.
  const apart = smoothStretches(changes);
  const closest = closestZoom(view, MIN_SPAN_M);
  const stretchBounds = [0, ...changes, frames];
  const allowed = new Float64Array(frames); // log of the zoom each frame's stretch allows
  for (let b = 0; b + 1 < stretchBounds.length; b++) {
    const from = stretchBounds[b];
    const to = stretchBounds[b + 1];
    const speeds: number[] = [];
    for (let f = Math.max(from, drawStart); f < Math.min(to - 1, drawEnd); f++)
      speeds.push(Math.hypot(apart.cx[f + 1] - apart.cx[f], apart.cy[f + 1] - apart.cy[f]) * fps);
    speeds.sort((x, y) => x - y);
    // Straight from the stretch's first head position to its last, per second: never more
    // than the real pace, and on a short stretch close to it.
    const first = Math.max(from, drawStart);
    const last = Math.min(to - 1, drawEnd);
    const average =
      last > first
        ? (Math.hypot(hx[last] - hx[first], hy[last] - hy[first]) * fps) / (last - first)
        : 0;
    // A stretch too short to measure takes its neighbours' zoom (see below).
    const fast =
      speeds.length >= fps / 2 ? Math.max(speeds[Math.floor(speeds.length * 0.95)], average) : 0;
    let z = Math.min(closest, fast > 0 ? (panRate * view.width) / fast : closest);
    if (z >= 2) z = 2 ** Math.floor(Math.log2(z));
    allowed.fill(Math.log(Math.max(1, z)), from, to);
  }
  // From one zoom to the next smoothly, never closer than any stretch nearby allows: each
  // frame first takes the lowest zoom within the blur's reach, then the blur averages only
  // values at or below its own stretch's.
  const zoomSigma = Math.max(1, ZOOM_SMOOTHING_S * fps);
  const reach = Math.ceil(3 * zoomSigma);
  const lowest = allowed.map((_, f) => {
    let m = Infinity;
    for (let j = Math.max(0, f - reach); j <= Math.min(frames - 1, f + reach); j++)
      m = Math.min(m, allowed[j]);
    return m;
  });
  const zoomAt = gaussianBlur(lowest, zoomSigma).map((u) => {
    // Back from log scale, a power of two comes out a rounding error away; snap it.
    const z = Math.exp(u);
    const power = 2 ** Math.round(Math.log2(z));
    return Math.abs(z - power) < 1e-9 * power ? power : z;
  });
  const maxZoom = Math.max(...zoomAt);
  const path: CameraPath = {
    zoom: new Float32Array(frames).fill(1),
    tx: new Float32Array(frames),
    ty: new Float32Array(frames),
    maxZoom: Math.max(1, maxZoom),
  };
  if (maxZoom <= 1.05) return path; // too fast to follow closely: the whole route throughout

  // A short jump is smoothed over like any turn; a longer one gets a glide.
  const glides = changes.filter(
    (f) => Math.hypot(hx[f] - hx[f - 1], hy[f] - hy[f - 1]) * zoomAt[f] >= GLIDE_JUMP * view.width,
  );
  let { cx, cy } = smoothStretches(glides);

  // Keep the head within the leash: pull the path towards it where it strays, smoothly,
  // never across a glide.
  const halfX = LEASH * (view.width / 2);
  const halfY = LEASH * Math.min(centreY, view.height - centreY);
  const excess = (h: Float64Array, c: Float64Array, half: number) =>
    h.map((v, f) => {
      const d = v - c[f];
      return Math.sign(d) * Math.max(0, Math.abs(d) - half / zoomAt[f]);
    });
  const bounds = [0, ...glides, frames];
  const blurStretches = (src: Float64Array, s: number) => {
    const out = new Float64Array(frames);
    for (let b = 0; b + 1 < bounds.length; b++)
      out.set(gaussianBlur(src.subarray(bounds[b], bounds[b + 1]), s), bounds[b]);
    return out;
  };
  for (let round = 0; round < 8; round++) {
    const ex = excess(hx, cx, halfX);
    const ey = excess(hy, cy, halfY);
    if (Math.max(...ex.map(Math.abs), ...ey.map(Math.abs)) < 0.5) break;
    const bx = blurStretches(ex, sigma / 2);
    const by = blurStretches(ey, sigma / 2);
    // The blur flattens a correction's peak; doubling it reaches the head in a few rounds.
    cx = cx.map((c, f) => c + 2 * bx[f]);
    cy = cy.map((c, f) => c + 2 * by[f]);
  }
  // Whatever is left (a very sharp turn), clamp directly.
  const ex = excess(hx, cx, halfX);
  const ey = excess(hy, cy, halfY);
  cx = cx.map((c, f) => c + ex[f]);
  cy = cy.map((c, f) => c + ey[f]);

  // The view on every frame: its size relative to the base view and its centre. Blending
  // two views moves each edge linearly, so a point inside both stays in view throughout.
  const size = zoomAt.map((z) => 1 / z);
  const vx = Float64Array.from(cx);
  const vy = Float64Array.from(cy);
  const ease = (s: number) => s * s * (3 - 2 * s);
  for (let g = 0; g < glides.length; g++) {
    const at = glides[g];
    // About 1 s for a short jump, up to 2.5 s for a long one, but never more than half of
    // either stretch it joins.
    const jump = (Math.hypot(hx[at] - hx[at - 1], hy[at] - hy[at - 1]) * zoomAt[at]) / view.width;
    const before = at - bounds[g];
    const after = bounds[g + 2] - at;
    const half = Math.max(
      1,
      Math.round(
        Math.min(
          (Math.min(2.5, 1 + 0.5 * Math.log2(jump / GLIDE_JUMP)) * fps) / 2,
          before / 2,
          after / 2,
        ),
      ),
    );
    // The bridge: the smallest view (up to the base view) that holds the heads on every
    // frame of the glide.
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let f = at - half; f < at + half; f++) {
      x0 = Math.min(x0, hx[f]);
      x1 = Math.max(x1, hx[f]);
      y0 = Math.min(y0, hy[f]);
      y1 = Math.max(y1, hy[f]);
    }
    const bridgeSize = Math.min(
      1,
      Math.max(size[at], (x1 - x0) / (LEASH * area.w), (y1 - y0) / (LEASH * area.h)),
    );
    const bx = bridgeSize >= 1 ? centreX : (x0 + x1) / 2;
    const by = bridgeSize >= 1 ? centreY : (y0 + y1) / 2;
    for (let f = at - half; f < at + half; f++) {
      const w = ease(f < at ? (f - (at - half)) / half : (at + half - f) / half);
      size[f] = (1 - w) * size[f] + w * bridgeSize;
      vx[f] = (1 - w) * vx[f] + w * bx;
      vy[f] = (1 - w) * vy[f] + w * by;
    }
  }

  // The pull-back: from the follow view to the base view over the last `PULL_BACK_S`.
  const back = Math.min(frames - 1, Math.round(PULL_BACK_S * fps));
  const backStart = frames - 1 - back;
  for (let f = 0; f < frames; f++) {
    const w = back > 0 ? ease(Math.min(1, Math.max(0, (f - backStart) / back))) : 0;
    const z = 1 / ((1 - w) * size[f] + w);
    const x = vx[f] + w * (centreX - vx[f]);
    const y = vy[f] + w * (centreY - vy[f]);
    path.zoom[f] = z;
    path.tx[f] = centreX - x * z;
    path.ty[f] = centreY - y * z;
  }
  return path;
}
