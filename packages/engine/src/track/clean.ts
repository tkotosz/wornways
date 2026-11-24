import { distanceM, longitudeDelta, metresPerDegree } from './geo.ts';
import { STRIDE, type Track } from './types.ts';

// Cleaning rules based on third-party MIT-licensed code (see THIRD_PARTY_NOTICES.md).

/** Fastest plausible speed per sport in m/s; anything faster is treated as a GPS spike. */
const MAX_SPEED: Record<string, number> = {
  run: 7,
  walk: 5,
  hike: 5,
  ride: 25,
  'e-bike-ride': 25,
  'alpine-ski': 40,
};
const DEFAULT_MAX_SPEED = 25;

export function maxSpeedFor(sport: string): number {
  return Object.hasOwn(MAX_SPEED, sport) ? MAX_SPEED[sport] : DEFAULT_MAX_SPEED;
}

export type CleanOptions = {
  /** m/s; defaults to a per-sport value. */
  maxSpeed?: number;
  /** Consecutive spikes after which the signal is considered lost and the track is cut. */
  maxRejects?: number;
  /** Minimum spacing between kept points in metres. */
  spacing?: number;
  /** A single step this long near either end counts as a GPS jump (see `trimEdgeJumps`); 0 turns it off. */
  edgeJumpM?: number;
  /** How far from each end, in seconds of track time, to look for jumps. */
  edgeWindowS?: number;
  /** m/s a jump must imply to count; defaults to half the sport's top speed. */
  edgeJumpSpeed?: number;
};

export type EdgeTrim = {
  track: Track;
  /** Points dropped from the start and from the end. */
  start: number;
  end: number;
};

/**
 * Drops points cut off from the rest of the track by a jump near the start or the end,
 * such as a first fix recorded before the GPS had locked on.
 *
 * Within `edgeWindowS` of each end, a single step longer than `edgeJumpM` that also implies
 * more than `edgeJumpSpeed` is treated as a jump, and everything on the far side of the last
 * such step is dropped. The speed test keeps genuine signal gaps: a correct start at home
 * followed by a few minutes without a fix moves far, but at a normal pace. The most this
 * can remove is the first or last couple of minutes.
 */
export function trimEdgeJumps(
  track: Track,
  options: Pick<CleanOptions, 'edgeJumpM' | 'edgeWindowS' | 'edgeJumpSpeed'> = {},
): EdgeTrim {
  const jumpM = options.edgeJumpM ?? 200;
  const windowS = options.edgeWindowS ?? 120;
  const jumpSpeed = options.edgeJumpSpeed ?? maxSpeedFor(track.sport) / 2;
  const p = track.points;
  const n = p.length / STRIDE;
  if (jumpM <= 0 || n < 3) return { track, start: 0, end: 0 };
  const t = (i: number) => p[i * STRIDE + 3];
  const isJump = (i: number) => {
    const d = distanceM(
      p[(i - 1) * STRIDE + 1],
      p[(i - 1) * STRIDE],
      p[i * STRIDE + 1],
      p[i * STRIDE],
    );
    return d > jumpM && d / Math.max(t(i) - t(i - 1), 1) > jumpSpeed;
  };
  const tEnd = t(n - 1);

  // First kept point: just after the last jump that starts within the window.
  let a = 0;
  for (let i = 1; i < n && t(i - 1) <= windowS; i++) if (isJump(i)) a = i;
  // One past the last kept point: just before the first jump that ends within the window.
  let b = n;
  for (let i = n - 1; i > a && tEnd - t(i) <= windowS; i--) if (isJump(i)) b = i;
  if (b - a < 2 || (a === 0 && b === n)) return { track, start: 0, end: 0 };

  const points = p.slice(a * STRIDE, b * STRIDE);
  const t0 = points[3];
  for (let i = 3; i < points.length; i += STRIDE) points[i] -= t0;
  return {
    track: { ...track, startTime: track.startTime + t0 * 1000, points },
    start: a,
    end: n - b,
  };
}

/**
 * Drops jumps at either end and GPS spikes, cuts the track at permanent signal loss, caps
 * pauses and thins points.
 *
 * A point is a spike when reaching it from the last good point needs more than `maxSpeed`.
 * Pauses are capped at 3x the median sampling interval so a cafe stop does not freeze the
 * animation. Returns null when fewer than two points survive.
 */
export function cleanTrack(track: Track, options: CleanOptions = {}): Track | null {
  track = trimEdgeJumps(track, options).track;
  const maxSpeed = options.maxSpeed ?? maxSpeedFor(track.sport);
  const maxRejects = options.maxRejects ?? 10;
  const spacing = options.spacing ?? 8;
  const p = track.points;
  const n = p.length / STRIDE;
  if (n < 2) return null;

  const { perLat, perLon } = metresPerDegree(p[1]);
  const keep: number[] = [0];
  let rejects = 0;
  for (let i = 1; i < n; i++) {
    const j = keep[keep.length - 1];
    const dt = p[i * STRIDE + 3] - p[j * STRIDE + 3];
    if (dt <= 0) continue;
    const d = Math.hypot(
      (p[i * STRIDE + 1] - p[j * STRIDE + 1]) * perLat,
      longitudeDelta(p[j * STRIDE], p[i * STRIDE]) * perLon,
    );
    if (d > 50 && d / dt > maxSpeed) {
      if (++rejects >= maxRejects) break;
      continue;
    }
    rejects = 0;
    keep.push(i);
  }
  if (keep.length < 2) return null;

  // Cap pauses, rebuilding the clock from the capped intervals.
  const dts = new Float64Array(keep.length - 1);
  for (let k = 1; k < keep.length; k++)
    dts[k - 1] = p[keep[k] * STRIDE + 3] - p[keep[k - 1] * STRIDE + 3];
  const median = Float64Array.from(dts).sort()[dts.length >> 1];
  const cap = 3 * median;

  // Thin to roughly `spacing` metres, always keeping the first and last point.
  const out: number[] = [];
  let t = 0;
  let lastLon = NaN;
  let lastLat = NaN;
  for (let k = 0; k < keep.length; k++) {
    const src = keep[k] * STRIDE;
    if (k > 0) t += Math.min(dts[k - 1], cap);
    const isEnd = k === 0 || k === keep.length - 1;
    if (!isEnd && distanceM(lastLat, lastLon, p[src + 1], p[src]) < spacing) continue;
    lastLon = p[src];
    lastLat = p[src + 1];
    out.push(lastLon, lastLat, p[src + 2], t);
  }
  return { ...track, points: new Float64Array(out) };
}

export function trackLengthM(track: Pick<Track, 'points'>): number {
  const p = track.points;
  let total = 0;
  for (let i = STRIDE; i < p.length; i += STRIDE)
    total += distanceM(p[i - STRIDE + 1], p[i - STRIDE], p[i + 1], p[i]);
  return total;
}

/**
 * Rewrites a track's clock so it moves at a constant speed along the route, keeping its
 * total duration: replays then draw the line evenly instead of following the real pace.
 * The recorded clock stays in `recorded`, for the values that need real time.
 */
export function paceByDistance(track: Track): Track {
  const p = track.points;
  const n = p.length / STRIDE;
  const total = p[(n - 1) * STRIDE + 3];
  const points = p.slice();
  const cumulative = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    cumulative[i] =
      cumulative[i - 1] +
      distanceM(p[(i - 1) * STRIDE + 1], p[(i - 1) * STRIDE], p[i * STRIDE + 1], p[i * STRIDE]);
  }
  const length = cumulative[n - 1];
  const recorded = track.recorded ?? new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (!track.recorded) recorded[i] = p[i * STRIDE + 3];
    points[i * STRIDE + 3] =
      length > 0 ? (cumulative[i] / length) * total : (i / Math.max(1, n - 1)) * total;
  }
  return { ...track, points, recorded };
}
