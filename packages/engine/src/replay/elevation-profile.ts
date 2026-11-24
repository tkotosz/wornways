// The climb profile along the bottom of a single activity's video: its elevation over the
// distance, the part covered so far in the route's orange, with a dot where the activity is.

import { distanceM } from '../track/geo.ts';
import { STRIDE, type Track } from '../track/types.ts';
import type { Context2DLike } from './render.ts';

export type ElevationProfile = {
  /** Elevation in metres at evenly spaced distances, from the start to the finish. */
  elevation: Float32Array;
  /** The activity's distance in metres, measured as the renderer measures it. */
  totalM: number;
  /** The elevations the strip's bottom and top stand for. */
  low: number;
  high: number;
};

/** A profile rising less than this, in metres, is drawn as this much: flat looks flat. */
const MIN_RANGE_M = 60;

/**
 * The profile of `track` in `samples` steps of distance: the mean elevation of the points in
 * each step, steps without one filled in from their neighbours, then lightly smoothed. Null
 * when the track has no elevation or no distance.
 */
export function elevationProfile(
  track: Pick<Track, 'points'>,
  samples: number,
): ElevationProfile | null {
  const p = track.points;
  const n = p.length / STRIDE;
  const metres = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const o = i * STRIDE;
    metres[i] = metres[i - 1] + distanceM(p[o - STRIDE + 1], p[o - STRIDE], p[o + 1], p[o]);
  }
  const totalM = n > 0 ? metres[n - 1] : 0;
  if (!(totalM > 0) || samples < 2) return null;

  const sum = new Float64Array(samples);
  const count = new Uint32Array(samples);
  for (let i = 0; i < n; i++) {
    const ele = p[i * STRIDE + 2];
    if (!Number.isFinite(ele)) continue;
    const step = Math.min(samples - 1, Math.floor((metres[i] / totalM) * samples));
    sum[step] += ele;
    count[step]++;
  }
  const known: number[] = [];
  for (let s = 0; s < samples; s++) if (count[s] > 0) known.push(s);
  if (known.length === 0) return null;

  const raw = new Float64Array(samples);
  for (const s of known) raw[s] = sum[s] / count[s];
  // Steps without a point: on a straight line between the known ones around them.
  for (let k = 0; k < known.length; k++) {
    const from = known[k];
    const to = known[k + 1];
    if (to === undefined) raw.fill(raw[from], from + 1);
    else
      for (let s = from + 1; s < to; s++)
        raw[s] = raw[from] + ((raw[to] - raw[from]) * (s - from)) / (to - from);
  }
  raw.fill(raw[known[0]], 0, known[0]);

  const elevation = new Float32Array(samples);
  for (let s = 0; s < samples; s++) {
    const before = raw[Math.max(0, s - 1)];
    const after = raw[Math.min(samples - 1, s + 1)];
    elevation[s] = (before + 2 * raw[s] + after) / 4;
  }
  let low = Infinity;
  let high = -Infinity;
  for (const e of elevation) {
    low = Math.min(low, e);
    high = Math.max(high, e);
  }
  if (high - low < MIN_RANGE_M) {
    const middle = (high + low) / 2;
    low = middle - MIN_RANGE_M / 2;
    high = middle + MIN_RANGE_M / 2;
  }
  return { elevation, totalM, low, high };
}

export type Box = { x: number; y: number; width: number; height: number };

/**
 * Draws the profile in `box`, `metres` into the activity: the part covered in orange, the
 * rest faint, and a glowing dot on the line where the activity is.
 */
export function drawElevationProfile(
  ctx: Context2DLike,
  profile: ElevationProfile,
  box: Box,
  metres: number,
  unit: number,
): void {
  const { elevation, totalM, low, high } = profile;
  const last = elevation.length - 1;
  const bottom = box.y + box.height;
  const xOf = (s: number) => box.x + (s / last) * box.width;
  // The lowest point keeps a little fill under it, so the strip reads as ground.
  const yOf = (e: number) => bottom - (0.14 + (0.86 * (e - low)) / (high - low)) * box.height;

  const at = Math.min(1, Math.max(0, metres / totalM)) * last;
  const step = Math.min(last - 1, Math.floor(at));
  const f = at - step;
  const head = {
    x: xOf(at),
    y: yOf(elevation[step] + f * (elevation[step + 1] - elevation[step])),
  };

  /** Traces the line from sample `from` to `to`, starting or ending at the head when given. */
  const trace = (from: number, to: number, start?: typeof head, end?: typeof head) => {
    if (start) ctx.lineTo(start.x, start.y);
    for (let s = from; s <= to; s++) ctx.lineTo(xOf(s), yOf(elevation[s]));
    if (end) ctx.lineTo(end.x, end.y);
  };

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // What is still ahead: faint.
  ctx.beginPath();
  ctx.moveTo(head.x, bottom);
  trace(step + 1, last, head);
  ctx.lineTo(xOf(last), bottom);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(head.x, head.y);
  trace(step + 1, last);
  ctx.lineWidth = 2 * unit;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.stroke();

  // What is covered: orange, fading to the bottom.
  if (at > 0) {
    ctx.beginPath();
    ctx.moveTo(box.x, bottom);
    trace(0, step, undefined, head);
    ctx.lineTo(head.x, bottom);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, box.y, 0, bottom);
    fill.addColorStop(0, 'rgba(255, 138, 42, 0.55)');
    fill.addColorStop(1, 'rgba(255, 138, 42, 0.12)');
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(elevation[0]));
    trace(1, step, undefined, head);
    ctx.lineWidth = 2.5 * unit;
    ctx.strokeStyle = 'rgba(255, 176, 102, 0.95)';
    ctx.stroke();
  }

  // The dot, like the route's head.
  const radius = 12 * unit;
  const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, radius);
  glow.addColorStop(0, 'rgba(255, 244, 230, 0.95)');
  glow.addColorStop(0.3, 'rgba(255, 190, 130, 0.55)');
  glow.addColorStop(1, 'rgba(255, 120, 40, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(head.x, head.y, radius, 0, Math.PI * 2);
  ctx.fill();
}
