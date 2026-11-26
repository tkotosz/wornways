import { distanceM, mercatorY } from '../track/geo.ts';
import { SENSOR_CHANNELS, STRIDE, type SensorChannel, type Track } from '../track/types.ts';
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
  /** The lowest elevation reached up to each point; zero when the track has no elevation. */
  bottom: Float64Array;
  /** The elevation at each point, the last one known where a point has none; zero before any. */
  elevation: Float64Array;
  /** Cumulative seconds moving at each point (see `MOVING_SPEED`). */
  moving: Float64Array;
  /** The top speed reached up to each point, in meters per second (see `TOP_SPEED_WINDOW_S`). */
  fastest: Float64Array;
  /** The speed at each point, in meters per second: over the window that ends there. */
  speed: Float64Array;
  /** Running sums of each sensor channel the track recorded (see `SensorSums`). */
  sensors: Partial<Record<SensorChannel, SensorSums>>;
  /** Whether the track recorded elevation. */
  hasElevation: boolean;
  count: number;
};

/**
 * A sensor channel up to each point: the values weighed by the seconds they lasted, added up
 * (`total`), those seconds (`time`), so `total / time` is the average over time, the highest
 * and the lowest value (`max`, `min`), and the value at the point (`now`, the last one known
 * where the point has none). A stretch counts when either end has a value; cadence leaves out
 * stretches at zero, such as coasting.
 */
export type SensorSums = {
  total: Float64Array;
  time: Float64Array;
  max: Float64Array;
  min: Float64Array;
  now: Float64Array;
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
  track: Pick<Track, 'points' | 'recorded' | 'sensors'>,
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
  const bottom: number[] = [];
  const elevation: number[] = [];
  const moving: number[] = [];
  const fastest: number[] = [];
  const speed: number[] = [];
  const channels = SENSOR_CHANNELS.filter((channel) => track.sensors?.[channel]);
  const sums = channels.map(() => ({
    total: [] as number[],
    time: [] as number[],
    max: [] as number[],
    min: [] as number[],
    now: [] as number[],
  }));
  const running = channels.map(() => ({
    total: 0,
    time: 0,
    max: -Infinity,
    min: Infinity,
    now: NaN,
  }));
  /** Every point's seconds and cumulative meters, for the top speed's window. */
  const seconds = new Float64Array(n);
  const reached = new Float64Array(n);
  let windowStart = 0;
  let topSpeed = 0;
  let speedNow = 0;
  let metres = 0;
  let climbed = 0;
  let descended = 0;
  let highest = -Infinity;
  let lowest = Infinity;
  let elevationNow = NaN;
  let movingSeconds = 0;
  /** Elevation the next rise or fall is measured from; NaN until a point has elevation. */
  let level = NaN;
  for (let i = 0; i < n; i++) {
    const o = i * STRIDE;
    // Moving time and top speed go by the recorded clock, also under even pace.
    const clock = track.recorded ? track.recorded[i] : p[o + 3];
    if (i > 0) {
      const step = distanceM(p[o - STRIDE + 1], p[o - STRIDE], p[o + 1], p[o]);
      const dt = clock - seconds[i - 1];
      metres += step;
      if (dt > 0 && step / dt >= MOVING_SPEED) movingSeconds += dt;
    }
    seconds[i] = clock;
    reached[i] = metres;
    channels.forEach((channel, c) => {
      const values = track.sensors![channel]!;
      const now = values[i];
      const sum = running[c];
      if (!Number.isNaN(now)) {
        sum.max = Math.max(sum.max, now);
        sum.min = Math.min(sum.min, now);
        sum.now = now;
      }
      if (i === 0) return;
      const before = values[i - 1];
      const value = Number.isNaN(before) ? now : Number.isNaN(now) ? before : (before + now) / 2;
      const dt = clock - seconds[i - 1];
      if (Number.isNaN(value) || dt <= 0 || (channel === 'cadence' && value === 0)) return;
      sum.total += value * dt;
      sum.time += dt;
    });
    // The latest window of at least TOP_SPEED_WINDOW_S seconds that ends at this point.
    while (windowStart + 1 < i && seconds[i] - seconds[windowStart + 1] >= TOP_SPEED_WINDOW_S)
      windowStart++;
    const span = seconds[i] - seconds[windowStart];
    if (span > 0) speedNow = (metres - reached[windowStart]) / span;
    if (span >= TOP_SPEED_WINDOW_S) topSpeed = Math.max(topSpeed, speedNow);
    const ele = p[o + 2];
    if (Number.isFinite(ele)) {
      highest = Math.max(highest, ele);
      lowest = Math.min(lowest, ele);
      elevationNow = ele;
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
    bottom.push(Number.isFinite(lowest) ? lowest : 0);
    elevation.push(Number.isNaN(elevationNow) ? 0 : elevationNow);
    moving.push(movingSeconds);
    fastest.push(topSpeed);
    speed.push(speedNow);
    running.forEach((sum, c) => {
      sums[c].total.push(sum.total);
      sums[c].time.push(sum.time);
      sums[c].max.push(Number.isFinite(sum.max) ? sum.max : 0);
      sums[c].min.push(Number.isFinite(sum.min) ? sum.min : 0);
      sums[c].now.push(Number.isNaN(sum.now) ? 0 : sum.now);
    });
  }
  return {
    xy: new Float32Array(xy),
    u: new Float64Array(u),
    dist: new Float64Array(dist),
    climb: new Float64Array(climb),
    descent: new Float64Array(descent),
    top: new Float64Array(top),
    bottom: new Float64Array(bottom),
    elevation: new Float64Array(elevation),
    moving: new Float64Array(moving),
    fastest: new Float64Array(fastest),
    speed: new Float64Array(speed),
    sensors: Object.fromEntries(
      channels.map((channel, c) => [
        channel,
        {
          total: new Float64Array(sums[c].total),
          time: new Float64Array(sums[c].time),
          max: new Float64Array(sums[c].max),
          min: new Float64Array(sums[c].min),
          now: new Float64Array(sums[c].now),
        },
      ]),
    ),
    hasElevation: !Number.isNaN(level),
    count: u.length,
  };
}
