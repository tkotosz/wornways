import { projectTrack } from './project.ts';
import type { Timeline } from './timeline.ts';
import type { Track } from '../track/types.ts';
import { trackArea, type View } from './view.ts';

/**
 * Where the camera is on every frame, relative to the base view (the view that fits all
 * tracks): a base-view pixel `p` appears on screen at `p * zoom + (tx, ty)`.
 */
export type CameraPath = {
  zoom: Float32Array;
  tx: Float32Array;
  ty: Float32Array;
  maxZoom: number;
};

export type CameraOptions = {
  fps: number;
  /** The closest the camera gets: the track area is never narrower than this many metres. */
  minSpanM?: number;
  /** Seconds the camera looks ahead, so it is already wide when a route gets there. */
  lookahead?: number;
  /** Half-width in seconds of the moving average that smooths the motion. */
  smoothing?: number;
};

/**
 * A camera that starts close on the first movement and pulls back to the base view in
 * one continuous motion.
 *
 * Zoom and position both follow a single progress value `w` (0 = close-up, 1 = base view):
 * the view's edges move linearly from the close-up's to the base view's as `w` grows. The
 * camera therefore never reverses or pans on its own. `w` over time is planned for the
 * whole video at once: the smallest smooth, never-decreasing curve that keeps everything
 * drawn so far (a little ahead) inside the view. Being concave in log-zoom, the pull-back
 * starts briskly and keeps slowing until it settles, instead of stopping and starting.
 */
export function followCamera(
  tracks: Pick<Track, 'points'>[],
  timeline: Timeline,
  view: View,
  options: CameraOptions,
): CameraPath {
  const frames = Math.round(timeline.duration * options.fps);
  const area = trackArea(view.width, view.height);
  const centreX = area.x + area.w / 2;
  const centreY = area.y + area.h / 2;

  // Metres per base-view pixel at the middle of the frame, for the closest-zoom limit.
  const mercY = (centreY - view.offY) / view.scale;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * mercY)));
  const metresPerPx = (40075016.686 * Math.cos(lat)) / view.scale;
  const closest = Math.min(64, Math.max(1, (area.w * metresPerPx) / (options.minSpanM ?? 3000)));

  // Per track: the bounding box of its first i points, so each frame's extent is a lookup.
  const projected = tracks.map((track) => {
    const p = projectTrack(track, view, 0.5);
    const box = new Float32Array(p.count * 4);
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (let i = 0; i < p.count; i++) {
      x0 = Math.min(x0, p.xy[i * 2]);
      x1 = Math.max(x1, p.xy[i * 2]);
      y0 = Math.min(y0, p.xy[i * 2 + 1]);
      y1 = Math.max(y1, p.xy[i * 2 + 1]);
      box.set([x0, y0, x1, y1], i * 4);
    }
    return { ...p, box, idx: 0 };
  });

  // The extent of everything drawn so far, per frame. It only ever grows.
  const ext = [
    new Float64Array(frames),
    new Float64Array(frames),
    new Float64Array(frames),
    new Float64Array(frames),
  ];
  const race = timeline.mode === 'race'; // every track is on screen from the first frame
  let firstFilled = -1;
  for (let f = 0; f < frames; f++) {
    const t = f / options.fps;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (let k = 0; k < projected.length; k++) {
      const tr = projected[k];
      const progress = timeline.progress(k, t);
      if (progress <= 0 && !race) continue;
      while (tr.idx + 1 < tr.count && tr.u[tr.idx + 1] <= progress) tr.idx++;
      // One point beyond the last one passed covers the head, which is part-way to it.
      const i = Math.min(tr.idx + (progress > tr.u[tr.idx] ? 1 : 0), tr.count - 1) * 4;
      x0 = Math.min(x0, tr.box[i]);
      y0 = Math.min(y0, tr.box[i + 1]);
      x1 = Math.max(x1, tr.box[i + 2]);
      y1 = Math.max(y1, tr.box[i + 3]);
    }
    if (x0 > x1) continue; // nothing on screen yet; filled in below
    if (firstFilled < 0) firstFilled = f;
    [ext[0][f], ext[1][f], ext[2][f], ext[3][f]] = [x0, y0, x1, y1];
  }
  if (firstFilled < 0) throw new Error('The timeline never shows any track');
  for (let f = 0; f < firstFilled; f++) for (const e of ext) e[f] = e[firstFilled];

  // Look ahead, so the camera is already wide when a route gets somewhere.
  const ahead = Math.round((options.lookahead ?? 0.5) * options.fps);
  const at = (f: number) => Math.min(frames - 1, f + ahead);

  // The two ends of the motion: a close-up on where things start, and the base view.
  const g0 = at(0);
  const startZoom = Math.min(
    closest,
    Math.max(
      1,
      Math.min(
        area.w / Math.max(ext[2][g0] - ext[0][g0], 1e-6),
        area.h / Math.max(ext[3][g0] - ext[1][g0], 1e-6),
      ) / 1.2,
    ),
  );
  const path: CameraPath = {
    zoom: new Float32Array(frames),
    tx: new Float32Array(frames),
    ty: new Float32Array(frames),
    maxZoom: startZoom,
  };
  const c0 = [(ext[0][g0] + ext[2][g0]) / 2, (ext[1][g0] + ext[3][g0]) / 2];
  const c1 = [centreX, centreY];
  const half = [area.w / 2, area.h / 2];
  if (startZoom <= 1.001) {
    path.zoom.fill(1);
    return path;
  }

  // Routes should stay inside this share of the view, leaving some air at the edges.
  const inner = 0.85;
  // For each frame, the least progress whose view contains the extent. Each view edge moves
  // linearly in w from the close-up's to the base view's, so each edge gives a bound on w.
  const need = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    const g = at(f);
    let w = 0;
    for (const axis of [0, 1]) {
      const lo0 = c0[axis] - (inner * half[axis]) / startZoom;
      const hi0 = c0[axis] + (inner * half[axis]) / startZoom;
      const lo1 = c1[axis] - inner * half[axis];
      const hi1 = c1[axis] + inner * half[axis];
      const lo = ext[axis][g];
      const hi = ext[axis + 2][g];
      if (lo < lo0) w = Math.max(w, lo0 > lo1 ? (lo0 - lo) / (lo0 - lo1) : 1);
      if (hi > hi0) w = Math.max(w, hi1 > hi0 ? (hi - hi0) / (hi1 - hi0) : 1);
    }
    need[f] = Math.min(1, w);
  }

  // Plan in log scale, where equal steps look like equal amounts of zooming.
  const scaleAt = (w: number) => (1 - w) / startZoom + w; // view size relative to the base view
  const logNeed = need.map((w) => Math.log(scaleAt(w)));
  const u0 = Math.log(1 / startZoom);

  // Least concave majorant: the lowest curve above every requirement whose speed never
  // increases. Upper hull of the points (f, logNeed[f]), starting from the close-up.
  const hull: number[] = [0];
  const pts = (i: number) => (i === 0 ? u0 : logNeed[i]);
  for (let f = 1; f < frames; f++) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2];
      const b = hull[hull.length - 1];
      // Drop b if it lies on or below the line from a to f.
      if ((pts(b) - pts(a)) * (f - a) <= (pts(f) - pts(a)) * (b - a)) hull.pop();
      else break;
    }
    hull.push(f);
  }
  const plan = new Float64Array(frames);
  for (let h = 1; h < hull.length; h++) {
    const a = hull[h - 1];
    const b = hull[h];
    for (let f = a; f <= b; f++) plan[f] = pts(a) + ((pts(b) - pts(a)) * (f - a)) / (b - a);
  }

  // Round off the corners of the hull (and ease in from standstill) with a Gaussian, lift
  // the result just enough to stay above the requirements again, and settle on the base view.
  const sigma = Math.max(1, (options.smoothing ?? 0.8) * options.fps);
  const radius = Math.ceil(3 * sigma);
  const kernel = Array.from({ length: 2 * radius + 1 }, (_, j) =>
    Math.exp(-((j - radius) ** 2) / (2 * sigma * sigma)),
  );
  const kernelSum = kernel.reduce((x, y) => x + y, 0);
  const blur = (src: Float64Array) =>
    src.map((_, f) => {
      let sum = 0;
      for (let j = -radius; j <= radius; j++)
        sum += kernel[j + radius] * src[Math.min(frames - 1, Math.max(0, f + j))];
      return sum / kernelSum;
    });
  let smooth = blur(plan);
  let lift = 0;
  for (let f = 0; f < frames; f++) lift = Math.max(lift, logNeed[f] - smooth[f]);
  smooth = blur(smooth.map((u, f) => Math.min(0, Math.max(f === 0 ? u0 : -Infinity, u + lift))));
  // Holding the close-up exactly at the start keeps the first frame where the plan begins.
  smooth[0] = Math.max(smooth[0], u0);

  for (let f = 0; f < frames; f++) {
    const s = Math.min(1, Math.exp(smooth[f]));
    const w = Math.min(1, Math.max(0, (s - 1 / startZoom) / (1 - 1 / startZoom)));
    const zoom = 1 / scaleAt(w);
    const cx = c0[0] + w * (c1[0] - c0[0]);
    const cy = c0[1] + w * (c1[1] - c0[1]);
    path.zoom[f] = zoom;
    path.tx[f] = centreX - cx * zoom;
    path.ty[f] = centreY - cy * zoom;
  }
  return path;
}

/**
 * The map canvases a camera path needs: one per power-of-two zoom level, each covering
 * every part of the map that is on screen while that level is in use. Index = level.
 * Without a camera the base view itself is the only level.
 */
export function mapLevelViews(view: View, camera?: CameraPath): View[] {
  if (!camera) return [view];
  const top = Math.max(0, Math.ceil(Math.log2(camera.maxZoom) - 1e-6));
  const rects = Array.from({ length: top + 1 }, () => ({
    x0: Infinity,
    y0: Infinity,
    x1: -Infinity,
    y1: -Infinity,
  }));
  for (let f = 0; f < camera.zoom.length; f++) {
    const zoom = camera.zoom[f];
    const [a, b] = levelsFor(zoom, top);
    for (const level of a === b ? [a] : [a, b]) {
      const r = rects[level];
      r.x0 = Math.min(r.x0, -camera.tx[f] / zoom);
      r.y0 = Math.min(r.y0, -camera.ty[f] / zoom);
      r.x1 = Math.max(r.x1, (view.width - camera.tx[f]) / zoom);
      r.y1 = Math.max(r.y1, (view.height - camera.ty[f]) / zoom);
    }
  }
  return rects.map((r, level) => {
    const k = 2 ** level;
    if (r.x0 > r.x1)
      return {
        ...view,
        width: 2,
        height: 2,
        scale: view.scale * k,
        offX: view.offX * k,
        offY: view.offY * k,
      };
    return {
      ...view,
      width: Math.ceil((r.x1 - r.x0) * k) + 2,
      height: Math.ceil((r.y1 - r.y0) * k) + 2,
      scale: view.scale * k,
      offX: (view.offX - r.x0) * k + 1,
      offY: (view.offY - r.y0) * k + 1,
    };
  });
}

/** The two levels a zoom sits between (finer second), and they are equal at the ends. */
export function levelsFor(zoom: number, top: number): [number, number, number] {
  const exact = Math.log2(Math.max(zoom, 1));
  const a = Math.min(top, Math.max(0, Math.floor(exact + 1e-6)));
  const b = Math.min(top, a + 1);
  const frac = b === a ? 0 : Math.min(1, Math.max(0, exact - a));
  return [a, frac < 0.004 ? a : b, frac];
}

/** A portion of a map level, used from this frame until the next window at that level. */
export type LevelWindow = { from: number; view: View };

/** Split a long pan into bounded windows, aligned to the same pixel grid at each zoom. */
export function mapLevelWindows(view: View, camera: CameraPath): LevelWindow[][] {
  const top = Math.max(0, Math.ceil(Math.log2(camera.maxZoom) - 1e-6));
  const byLevel = Array.from({ length: top + 1 }, () => [] as LevelWindow[]);
  const padding = Math.ceil((32 * Math.min(view.width, view.height)) / 1080);
  for (let level = 0; level <= top; level++) {
    const k = 2 ** level;
    let x0 = 0;
    let y0 = 0;
    let x1 = 0;
    let y1 = 0;
    let from = -1;
    let maxWidth = 0;
    let maxHeight = 0;
    const save = () => {
      byLevel[level].push({
        from,
        view: {
          ...view,
          width: x1 - x0,
          height: y1 - y0,
          scale: view.scale * k,
          offX: view.offX * k - x0,
          offY: view.offY * k - y0,
        },
      });
    };
    for (let frame = 0; frame < camera.zoom.length; frame++) {
      const zoom = camera.zoom[frame];
      const [a, b] = levelsFor(zoom, top);
      if (level !== a && level !== b) continue;
      const s = k / zoom;
      const left = Math.floor(-camera.tx[frame] * s) - padding;
      const upper = Math.floor(-camera.ty[frame] * s) - padding;
      const right = Math.ceil((view.width - camera.tx[frame]) * s) + padding;
      const bottom = Math.ceil((view.height - camera.ty[frame]) * s) + padding;
      const width = Math.max(right, x1) - Math.min(left, x0);
      const height = Math.max(bottom, y1) - Math.min(upper, y0);
      if (from < 0 || width > maxWidth || height > maxHeight) {
        if (from >= 0) save();
        from = frame;
        [x0, y0, x1, y1] = [left, upper, right, bottom];
        maxWidth = Math.max(1.6 * view.width, right - left + 0.2 * view.width);
        maxHeight = Math.max(1.6 * view.height, bottom - upper + 0.2 * view.height);
      } else {
        x0 = Math.min(x0, left);
        y0 = Math.min(y0, upper);
        x1 = Math.max(x1, right);
        y1 = Math.max(y1, bottom);
      }
    }
    if (from >= 0) save();
  }
  return byLevel;
}
