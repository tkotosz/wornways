// The charts a video can show: the activities' elevation, heart rate, power, speed or cadence
// over their distance, laid end to end in date order, with a thin tick where one ends and the
// next begins. Each activity's part takes its chart's color as it is drawn (elevation orange,
// heart rate red, power yellow, speed blue, cadence green), with a dot where it is. All of them run along the distance,
// so the same spot on each is the same place on the route.

import { distanceM } from '../track/geo.ts';
import { STRIDE, type Track } from '../track/types.ts';
import type { Context2DLike } from './render.ts';

/** What a chart shows. */
export type ChartKind = 'elevation' | 'heart-rate' | 'power' | 'speed' | 'cadence';
export const CHART_KINDS: readonly ChartKind[] = [
  'elevation',
  'heart-rate',
  'power',
  'speed',
  'cadence',
];

/**
 * For each chart: the least range it is drawn against, so a flat stretch looks flat (meters,
 * beats per minute, watts, meters per second, rotations per minute); how many times its
 * values are smoothed, the jumpy ones the most; and its colors as red, green and blue: the fill, the line and the dot's glow.
 */
const CHARTS: Record<
  ChartKind,
  { minRange: number; smoothing: number; fill: string; line: string; glow: string }
> = {
  elevation: {
    minRange: 60,
    smoothing: 1,
    fill: '255, 138, 42',
    line: '255, 176, 102',
    glow: '255, 190, 130',
  },
  'heart-rate': {
    minRange: 30,
    smoothing: 3,
    fill: '255, 59, 79',
    line: '255, 120, 130',
    glow: '255, 150, 160',
  },
  power: {
    minRange: 100,
    smoothing: 8,
    fill: '255, 196, 0',
    line: '255, 214, 90',
    glow: '255, 225, 140',
  },
  speed: {
    minRange: 3,
    smoothing: 6,
    fill: '56, 182, 255',
    line: '120, 205, 255',
    glow: '160, 220, 255',
  },
  cadence: {
    minRange: 20,
    smoothing: 4,
    fill: '84, 214, 110',
    line: '140, 230, 155',
    glow: '170, 240, 180',
  },
};

/** A chart's colors as "red, green, blue": its fill and its line, for drawing it elsewhere. */
export const chartColors = (chart: ChartKind) => ({
  fill: CHARTS[chart].fill,
  line: CHARTS[chart].line,
});

type ChartTrack = Pick<Track, 'points' | 'sensors' | 'recorded'>;

/**
 * A chart's value at point `i` of `track`, NaN where it has none; `meters` are each point's
 * meters along the strip, for the speed: the distance from the point before over the
 * recorded time between them.
 */
function valueAt(track: ChartTrack, i: number, chart: ChartKind, meters?: Float64Array): number {
  if (chart === 'elevation') return track.points[i * STRIDE + 2]!;
  if (chart === 'speed') {
    if (i === 0 || !meters) return NaN;
    const seconds = (k: number) => track.recorded?.[k] ?? track.points[k * STRIDE + 3]!;
    const dt = seconds(i) - seconds(i - 1);
    return dt > 0 ? (meters[i]! - meters[i - 1]!) / dt : NaN;
  }
  const channel = chart === 'heart-rate' ? 'heartRate' : chart;
  const values = track.sensors?.[channel];
  return values ? values[i]! : NaN;
}

export type ChartProfile = {
  /** The values at evenly spaced distances, from the first start to the last finish. */
  values: Float32Array;
  /**
   * Where each activity starts, in meters along the strip; one more entry at the end, the
   * total. Distances are measured as the renderer measures them.
   */
  starts: Float64Array;
  /** The values the strip's bottom and top stand for. */
  low: number;
  high: number;
};

/** Each activity's points in meters along the strip, and where each activity starts. */
type Distances = { starts: Float64Array; along: Float64Array[] };

/** The distances the charts are drawn along, measured as the renderer measures them. */
function distancesOf(tracks: ChartTrack[]): Distances {
  const starts = new Float64Array(tracks.length + 1);
  const along = tracks.map((track, k) => {
    const p = track.points;
    const n = p.length / STRIDE;
    const meters = new Float64Array(n);
    meters[0] = starts[k]!;
    for (let i = 1; i < n; i++) {
      const o = i * STRIDE;
      meters[i] = meters[i - 1]! + distanceM(p[o - STRIDE + 1]!, p[o - STRIDE]!, p[o + 1]!, p[o]!);
    }
    starts[k + 1] = n > 0 ? meters[n - 1]! : starts[k]!;
    return meters;
  });
  return { starts, along };
}

/**
 * The profile of `chart` over `tracks`, end to end, in `samples` steps of distance: the mean
 * value of the points in each step, steps without one (also an activity without the value)
 * on a straight line between the values around them, then smoothed. Null when no activity has
 * the value, or there is no distance.
 */
export function chartProfile(
  tracks: ChartTrack[],
  samples: number,
  chart: ChartKind,
  distances: Distances = distancesOf(tracks),
): ChartProfile | null {
  const { starts, along } = distances;
  const totalM = starts[tracks.length]!;
  if (!(totalM > 0) || samples < 2) return null;

  const sum = new Float64Array(samples);
  const count = new Uint32Array(samples);
  tracks.forEach((track, k) => {
    for (let i = 0; i < along[k]!.length; i++) {
      const value = valueAt(track, i, chart, along[k]);
      if (!Number.isFinite(value)) continue;
      const step = Math.min(samples - 1, Math.floor((along[k]![i]! / totalM) * samples));
      sum[step] += value;
      count[step]++;
    }
  });
  const known: number[] = [];
  for (let s = 0; s < samples; s++) if (count[s]! > 0) known.push(s);
  if (known.length === 0) return null;

  const raw = new Float64Array(samples);
  for (const s of known) raw[s] = sum[s]! / count[s]!;
  // Steps without a point: on a straight line between the known ones around them.
  for (let k = 0; k < known.length; k++) {
    const from = known[k]!;
    const to = known[k + 1];
    if (to === undefined) raw.fill(raw[from]!, from + 1);
    else
      for (let s = from + 1; s < to; s++)
        raw[s] = raw[from]! + ((raw[to]! - raw[from]!) * (s - from)) / (to - from);
  }
  raw.fill(raw[known[0]!]!, 0, known[0]);

  const { minRange, smoothing } = CHARTS[chart];
  let values = new Float32Array(raw);
  for (let pass = 0; pass < smoothing; pass++) {
    const smoothed = new Float32Array(samples);
    for (let s = 0; s < samples; s++) {
      const before = values[Math.max(0, s - 1)]!;
      const after = values[Math.min(samples - 1, s + 1)]!;
      smoothed[s] = (before + 2 * values[s]! + after) / 4;
    }
    values = smoothed;
  }
  let low = Infinity;
  let high = -Infinity;
  for (const value of values) {
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  if (high - low < minRange) {
    const middle = (high + low) / 2;
    low = middle - minRange / 2;
    high = middle + minRange / 2;
  }
  return { values, starts, low, high };
}

/** Every chart `tracks` can show, measuring their distances once for all of them. */
export function chartProfiles(
  tracks: ChartTrack[],
  samples: number,
): Partial<Record<ChartKind, ChartProfile>> {
  const distances = distancesOf(tracks);
  const profiles: Partial<Record<ChartKind, ChartProfile>> = {};
  for (const chart of CHART_KINDS) {
    const profile = chartProfile(tracks, samples, chart, distances);
    if (profile) profiles[chart] = profile;
  }
  return profiles;
}

export type Box = { x: number; y: number; width: number; height: number };

/** Where an activity is: meters covered so far, and how strongly its dot shows (0: none). */
export type ProfileProgress = { meters: number; dot: number };

/**
 * Draws the profile of `chart` in `box`, with one entry of `progress` per activity: the part
 * each has covered in the chart's color, the rest faint, a thin tick between activities, and
 * a glowing dot on the line where each one is.
 */
export function drawChart(
  ctx: Context2DLike,
  chart: ChartKind,
  profile: ChartProfile,
  box: Box,
  progress: ProfileProgress[],
  unit: number,
): void {
  const { values, starts, low, high } = profile;
  const colors = CHARTS[chart];
  const last = values.length - 1;
  const totalM = starts[starts.length - 1]!;
  const bottom = box.y + box.height;
  /** The sample position of a distance along the strip. */
  const stepOf = (meters: number) => Math.min(1, Math.max(0, meters / totalM)) * last;
  const xOf = (meters: number) => box.x + (stepOf(meters) / last) * box.width;
  // The lowest value keeps a little fill under it, so the strip reads as ground.
  const heightOf = (value: number) => (0.14 + (0.86 * (value - low)) / (high - low)) * box.height;
  const yOf = (meters: number) => {
    const at = stepOf(meters);
    const s = Math.min(last - 1, Math.floor(at));
    return bottom - heightOf(values[s]! + (at - s) * (values[s + 1]! - values[s]!));
  };
  const xOfStep = (s: number) => box.x + (s / last) * box.width;
  const yOfStep = (s: number) => bottom - heightOf(values[s]!);

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
  covered.addColorStop(0, `rgba(${colors.fill}, 0.55)`);
  covered.addColorStop(1, `rgba(${colors.fill}, 0.12)`);
  const heads: number[] = [];
  progress.forEach(({ meters, dot }, k) => {
    const start = starts[k]!;
    const end = starts[k + 1]!;
    const head = start + Math.min(end - start, Math.max(0, meters));
    // What is still ahead: faint. What is covered: in the chart's color, fading downward.
    part(head, end, 'rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.35)', 2 * unit);
    part(start, head, covered, `rgba(${colors.line}, 0.95)`, 2.5 * unit);
    if (dot > 0) heads.push(head, dot);
  });

  // A thin tick where one activity ends and the next begins.
  ctx.lineWidth = 1.5 * unit;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  for (let k = 1; k < starts.length - 1; k++) {
    ctx.beginPath();
    ctx.moveTo(xOf(starts[k]!), bottom);
    ctx.lineTo(xOf(starts[k]!), box.y + box.height * 0.08);
    ctx.stroke();
  }

  // The dots, like the routes' heads.
  const radius = 12 * unit;
  for (let i = 0; i < heads.length; i += 2) {
    const [x, y] = [xOf(heads[i]!), yOf(heads[i]!)];
    const a = heads[i + 1]!;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(255, 244, 230, ${(0.95 * a).toFixed(3)})`);
    glow.addColorStop(0.3, `rgba(${colors.glow}, ${(0.55 * a).toFixed(3)})`);
    glow.addColorStop(1, `rgba(${colors.fill}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Which charts `tracks` can show: the speed always, elevation, heart rate, power and cadence
 * where one recorded them.
 */
export function chartsOf(tracks: ChartTrack[]): ChartKind[] {
  return CHART_KINDS.filter((chart) =>
    tracks.some((track) => {
      if (chart === 'speed') return track.points.length / STRIDE > 1;
      const n = track.points.length / STRIDE;
      for (let i = 0; i < n; i++) if (Number.isFinite(valueAt(track, i, chart))) return true;
      return false;
    }),
  );
}
