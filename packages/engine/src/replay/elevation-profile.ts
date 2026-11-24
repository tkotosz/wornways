// The climb profile along the bottom of a video: the activities' elevation over their
// distance, laid end to end in date order, with a thin tick where one ends and the next
// begins. Each activity's part turns orange as it is drawn, with a dot where it is.

import { distanceM } from '../track/geo.ts';
import { STRIDE, type Track } from '../track/types.ts';
import type { Context2DLike } from './render.ts';

export type ElevationProfile = {
  /** Elevation in meters at evenly spaced distances, from the first start to the last finish. */
  elevation: Float32Array;
  /**
   * Where each activity starts, in meters along the strip; one more entry at the end, the
   * total. Distances are measured as the renderer measures them.
   */
  starts: Float64Array;
  /** The elevations the strip's bottom and top stand for. */
  low: number;
  high: number;
};

/** A profile rising less than this, in meters, is drawn as this much: flat looks flat. */
const MIN_RANGE_M = 60;

/**
 * The profile of `tracks`, end to end, in `samples` steps of distance: the mean elevation of
 * the points in each step, steps without one (also an activity without elevation) on a
 * straight line between the heights around them, then lightly smoothed. Null when no
 * activity has elevation, or there is no distance.
 */
export function elevationProfile(
  tracks: Pick<Track, 'points'>[],
  samples: number,
): ElevationProfile | null {
  // Each point's meters from the first activity's start.
  const starts = new Float64Array(tracks.length + 1);
  const along = tracks.map((track, k) => {
    const p = track.points;
    const n = p.length / STRIDE;
    const meters = new Float64Array(n);
    meters[0] = starts[k];
    for (let i = 1; i < n; i++) {
      const o = i * STRIDE;
      meters[i] = meters[i - 1] + distanceM(p[o - STRIDE + 1], p[o - STRIDE], p[o + 1], p[o]);
    }
    starts[k + 1] = n > 0 ? meters[n - 1] : starts[k];
    return meters;
  });
  const totalM = starts[tracks.length];
  if (!(totalM > 0) || samples < 2) return null;

  const sum = new Float64Array(samples);
  const count = new Uint32Array(samples);
  tracks.forEach((track, k) => {
    const p = track.points;
    for (let i = 0; i < along[k].length; i++) {
      const ele = p[i * STRIDE + 2];
      if (!Number.isFinite(ele)) continue;
      const step = Math.min(samples - 1, Math.floor((along[k][i] / totalM) * samples));
      sum[step] += ele;
      count[step]++;
    }
  });
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
  return { elevation, starts, low, high };
}

export type Box = { x: number; y: number; width: number; height: number };

/** Where an activity is: meters covered so far, and how strongly its dot shows (0: none). */
export type ProfileProgress = { meters: number; dot: number };

/**
 * Draws the profile in `box`, with one entry of `progress` per activity: the part each has
 * covered in orange, the rest faint, a thin tick between activities, and a glowing dot on
 * the line where each one is.
 */
export function drawElevationProfile(
  ctx: Context2DLike,
  profile: ElevationProfile,
  box: Box,
  progress: ProfileProgress[],
  unit: number,
): void {
  const { elevation, starts, low, high } = profile;
  const last = elevation.length - 1;
  const totalM = starts[starts.length - 1];
  const bottom = box.y + box.height;
  /** The sample position of a distance along the strip. */
  const stepOf = (meters: number) => Math.min(1, Math.max(0, meters / totalM)) * last;
  const xOf = (meters: number) => box.x + (stepOf(meters) / last) * box.width;
  // The lowest point keeps a little fill under it, so the strip reads as ground.
  const yOf = (meters: number) => {
    const at = stepOf(meters);
    const s = Math.min(last - 1, Math.floor(at));
    const e = elevation[s] + (at - s) * (elevation[s + 1] - elevation[s]);
    return bottom - (0.14 + (0.86 * (e - low)) / (high - low)) * box.height;
  };
  const xOfStep = (s: number) => box.x + (s / last) * box.width;
  const yOfStep = (s: number) =>
    bottom - (0.14 + (0.86 * (elevation[s] - low)) / (high - low)) * box.height;

  /** Traces the line from `from` to `to` meters along the strip. */
  const trace = (from: number, to: number) => {
    ctx.lineTo(xOf(from), yOf(from));
    for (let s = Math.floor(stepOf(from)) + 1; s < stepOf(to); s++)
      ctx.lineTo(xOfStep(s), yOfStep(s));
    ctx.lineTo(xOf(to), yOf(to));
  };
  /** Fills under the line from `from` to `to`, then draws the line. */
  const part = (from: number, to: number, fill: unknown, line: string, width: number) => {
    if (!(to > from)) return;
    ctx.beginPath();
    ctx.moveTo(xOf(from), bottom);
    trace(from, to);
    ctx.lineTo(xOf(to), bottom);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(xOf(from), yOf(from));
    trace(from, to);
    ctx.lineWidth = width;
    ctx.strokeStyle = line;
    ctx.stroke();
  };

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.lineJoin = 'round';
  // Flat ends, so the parts meet without overlapping.
  ctx.lineCap = 'butt';
  const covered = ctx.createLinearGradient(0, box.y, 0, bottom);
  covered.addColorStop(0, 'rgba(255, 138, 42, 0.55)');
  covered.addColorStop(1, 'rgba(255, 138, 42, 0.12)');
  const heads: number[] = [];
  progress.forEach(({ meters, dot }, k) => {
    const start = starts[k];
    const end = starts[k + 1];
    const head = start + Math.min(end - start, Math.max(0, meters));
    // What is still ahead: faint. What is covered: orange, fading to the bottom.
    part(head, end, 'rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.35)', 2 * unit);
    part(start, head, covered, 'rgba(255, 176, 102, 0.95)', 2.5 * unit);
    if (dot > 0) heads.push(head, dot);
  });

  // A thin tick where one activity ends and the next begins.
  ctx.lineWidth = 1.5 * unit;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  for (let k = 1; k < starts.length - 1; k++) {
    ctx.beginPath();
    ctx.moveTo(xOf(starts[k]), bottom);
    ctx.lineTo(xOf(starts[k]), box.y + box.height * 0.08);
    ctx.stroke();
  }

  // The dots, like the routes' heads.
  const radius = 12 * unit;
  for (let i = 0; i < heads.length; i += 2) {
    const [x, y] = [xOf(heads[i]), yOf(heads[i])];
    const a = heads[i + 1];
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(255, 244, 230, ${(0.95 * a).toFixed(3)})`);
    glow.addColorStop(0.3, `rgba(255, 190, 130, ${(0.55 * a).toFixed(3)})`);
    glow.addColorStop(1, 'rgba(255, 120, 40, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}
