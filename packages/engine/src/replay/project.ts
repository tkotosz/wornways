import { distanceM, mercatorY } from '../track/geo.ts';
import { STRIDE, type Track } from '../track/types.ts';
import { viewX, type View } from './view.ts';

/** A track in the pixel coordinates of a view. */
export type Projected = {
  /** [x, y] per point. */
  xy: Float32Array;
  /** Fraction of the track's (cleaned) duration reached at each point, 0..1. */
  u: Float64Array;
  /** Cumulative metres at each point. */
  dist: Float64Array;
  /** Cumulative metres climbed at each point; all zero when the track has no elevation. */
  climb: Float64Array;
  /** Cumulative metres descended at each point; all zero when the track has no elevation. */
  descent: Float64Array;
  /** The highest elevation reached up to each point; zero when the track has no elevation. */
  top: Float64Array;
  /** Cumulative seconds moving at each point (see `MOVING_SPEED`). */
  moving: Float64Array;
  /** The top speed reached up to each point, in meters per second (see `TOP_SPEED_WINDOW_S`). */
  fastest: Float64Array;
  /** Whether the track recorded elevation. */
  hasElevation: boolean;
  count: number;
};

/** A rise or fall smaller than this, in metres, is taken for noise in the elevation. */
const CLIMB_STEP_M = 3;
/** Slower than this, in meters per second, a stretch of an activity counts as standing. */
export const MOVING_SPEED = 0.5;
/**
 * Top speed is the fastest average over at least this many seconds, so one point the GPS
 * put too far away does not count as a burst of speed.
 */
export const TOP_SPEED_WINDOW_S = 10;

/** Projects a track into `view`, dropping points closer than `minGapPx` to the one before. */
export function projectTrack(
  track: Pick<Track, 'points'>,
  view: View,
  minGapPx: number,
): Projected {
  const p = track.points;
  const n = p.length / STRIDE;
  const total = p[(n - 1) * STRIDE + 3];
  const xy: number[] = [];
  const u: number[] = [];
  const dist: number[] = [];
  const climb: number[] = [];
  const descent: number[] = [];
  const top: number[] = [];
  const moving: number[] = [];
  const fastest: number[] = [];
  /** Every point's seconds and cumulative meters, for the top speed's window. */
  const seconds = new Float64Array(n);
  const reached = new Float64Array(n);
  let windowStart = 0;
  let topSpeed = 0;
  let metres = 0;
  let climbed = 0;
  let descended = 0;
  let highest = -Infinity;
  let movingSeconds = 0;
  /** Elevation the next rise or fall is measured from; NaN until a point has elevation. */
  let level = NaN;
  for (let i = 0; i < n; i++) {
    const o = i * STRIDE;
    if (i > 0) {
      const step = distanceM(p[o - STRIDE + 1], p[o - STRIDE], p[o + 1], p[o]);
      const dt = p[o + 3] - p[o - STRIDE + 3];
      metres += step;
      if (dt > 0 && step / dt >= MOVING_SPEED) movingSeconds += dt;
    }
    seconds[i] = p[o + 3];
    reached[i] = metres;
    // The latest window of at least TOP_SPEED_WINDOW_S seconds that ends at this point.
    while (windowStart + 1 < i && seconds[i] - seconds[windowStart + 1] >= TOP_SPEED_WINDOW_S)
      windowStart++;
    const span = seconds[i] - seconds[windowStart];
    if (span >= TOP_SPEED_WINDOW_S)
      topSpeed = Math.max(topSpeed, (metres - reached[windowStart]) / span);
    const ele = p[o + 2];
    if (Number.isFinite(ele)) {
      highest = Math.max(highest, ele);
      if (Number.isNaN(level)) level = ele;
      else if (ele - level >= CLIMB_STEP_M) {
        climbed += ele - level;
        level = ele;
      } else if (level - ele >= CLIMB_STEP_M) {
        descended += level - ele;
        level = ele;
      }
    }
    const x = viewX(p[o], view);
    const y = mercatorY(p[o + 1]) * view.scale + view.offY;
    const k = xy.length;
    if (i > 0 && i < n - 1 && Math.hypot(x - xy[k - 2], y - xy[k - 1]) < minGapPx) continue;
    xy.push(x, y);
    u.push(total > 0 ? p[o + 3] / total : i / (n - 1));
    dist.push(metres);
    climb.push(climbed);
    descent.push(descended);
    top.push(Number.isFinite(highest) ? highest : 0);
    moving.push(movingSeconds);
    fastest.push(topSpeed);
  }
  return {
    xy: new Float32Array(xy),
    u: new Float64Array(u),
    dist: new Float64Array(dist),
    climb: new Float64Array(climb),
    descent: new Float64Array(descent),
    top: new Float64Array(top),
    moving: new Float64Array(moving),
    fastest: new Float64Array(fastest),
    hasElevation: !Number.isNaN(level),
    count: u.length,
  };
}
