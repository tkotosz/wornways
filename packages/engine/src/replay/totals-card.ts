// The totals card after the replay of several activities: the finished map dims, a text
// such as the title comes in, and the totals count up. What it shows is a list of widgets, as
// over the replay (see widgets.ts): text, and the totals as values, each centered on its
// point; at first activities, distance, moving time and climb, without the title, which the
// map behind it still shows.
// It is added after the replay and before the end card, so the replay keeps the length it
// was given.

import { averagePace, topSpeed } from './pace.ts';
import { drawIconBefore, iconOf, iconRoom, type IconName } from './icons.ts';
import {
  DATE_FORMATS,
  TIME_FORMATS,
  dateSpan,
  defaultFormat,
  distanceUnit,
  durationText,
  formatsOf,
  heightUnit,
  inDistanceUnits,
  inHeightUnits,
  type DateFormat,
  type TimeFormat,
  type Units,
  type ValueFormat,
} from './formats.ts';
import {
  METRICS,
  SINGLE_ONLY,
  numberOf,
  type Metric,
  type MetricText,
  type MetricValue,
} from './metrics.ts';
import type { CanvasLike, Context2DLike } from './render.ts';
import { sensorValueText } from './sensor-text.ts';
import type { Widget } from './widgets.ts';

/** How long the totals card plays, in seconds. */
export const TOTALS_CARD_S = 3.4;

/** When each part starts and how long it takes, in seconds from the end of the replay. */
const TIMING = {
  /** The map dims behind the card. */
  dim: { at: 0, length: 0.6 },
  /** The title fades in. */
  title: { at: 0.25, length: 0.5 },
  /** The values fade in, one after another, and count up. */
  values: { at: 0.45, length: 0.45, stagger: 0.12 },
  count: { at: 0.45, length: 1.3 },
} as const;

/** How dark the map gets behind the card. */
const DIM = 0.82;
/** Slower than this, in meters per second, a stretch of an activity counts as standing. */

/** The number of frames the totals card adds at this frame rate. */
export const totalsCardFrames = (fps: number) => Math.round(TOTALS_CARD_S * fps);

/**
 * A value the totals card can show: every value a widget can show over several activities
 * (see `Metric`), as their totals at the end. Each is a number with its unit and words under
 * it that say what it is: "312 / km in total", "62.5 / km avg per ride", "178 / bpm max heart
 * rate".
 */
export type TotalsField = Exclude<Metric, (typeof SINGLE_ONLY)[number]>;
/** Every value of the totals card, in the order the settings list them. */
export const TOTALS_FIELDS: readonly TotalsField[] = METRICS.filter(
  (metric): metric is TotalsField => !(SINGLE_ONLY as readonly Metric[]).includes(metric),
);
/** The values the totals card shows unless told otherwise, in this order. */
export const AUTOMATIC_TOTALS: readonly TotalsField[] = ['count', 'distance', 'moving', 'climb'];
/** The values a single activity's totals card shows unless told otherwise. */
export const AUTOMATIC_TOTALS_ONE: readonly TotalsField[] = ['distance', 'moving', 'climb'];

/** The values that mean nothing for one activity: the count, the days and the per activity. */
const SEVERAL_ONLY = (field: TotalsField) =>
  field === 'count' ||
  field === 'days' ||
  field === 'moving-days' ||
  /^(avg|max|min)-(time|distance|climb|calories)$/.test(field);

export type Totals = {
  activities: number;
  meters: number;
  /** Seconds moving: the stretches between points covered at walking speed or faster. */
  movingSeconds: number;
  /** Seconds from each activity's first point to its last, added up. */
  totalSeconds: number;
  /** Meters climbed and descended; null when no activity recorded elevation. */
  climbed: number | null;
  descended: number | null;
  /** The highest and lowest elevation, in meters; null when no activity recorded elevation. */
  highest: number | null;
  lowest: number | null;
  /** The calendar days from the first activity's to the last one's, both counted. */
  days: number;
  /** How many calendar days have an activity starting on them. */
  movingDays: number;
  /** The top speed of any activity, in meters per second (see `TOP_SPEED_WINDOW_S`). */
  topSpeed: number;
  /**
   * Each activity's own meters, seconds (stops included), meters climbed (null when none
   * recorded elevation) and calories (null when none gave them; zero for one that did not).
   */
  each: {
    meters: number[];
    seconds: number[];
    climbed: number[] | null;
    calories: number[] | null;
  };
  /**
   * Averages over time of the activities that recorded them, the highest, and the lowest heart
   * rate and temperature; null when none did. Cadence is in rotations per minute (one leg's
   * strides on foot).
   */
  heartRate: number | null;
  maxHeartRate: number | null;
  minHeartRate: number | null;
  power: number | null;
  maxPower: number | null;
  cadence: number | null;
  maxCadence: number | null;
  temperature: number | null;
  minTemperature: number | null;
  maxTemperature: number | null;
  /** Kilocalories of the activities that gave them; null when none did. */
  calories: number | null;
  /** Whether every activity is on foot, so pace is told in minutes per kilometer. */
  onFoot: boolean;
  /** When the first and the last activity started: the days they span. */
  firstStart: number;
  lastStart: number;
};

export type TotalsCardOptions = {
  width: number;
  height: number;
  fontFamily: string;
  /** The video's title, which a text widget without its own text shows; empty for none. */
  title: string;
  /** Singular and plural noun for the count, e.g. ["ride", "rides"]. */
  countLabel: [string, string];
  units: Units;
  /**
   * What the card shows, as widgets (see widgets.ts): text, and values (a value widget's
   * metric is one of `TOTALS_FIELDS`), at first arranged in the card's layout (layouts.ts).
   */
  widgets: readonly Widget[];
  /** Draw the card without its widgets, for an editor that draws them itself. */
  hideWidgets?: boolean;
};

/**
 * The card's type sizes at 100%, for a frame 1080 pixels on its shorter side: the title, a
 * value's number (the dates' smaller, being long), the words under a value, and the gap from
 * the number's baseline to theirs, less their own size.
 */
const SIZES = { title: 52, value: 96, dates: 60, label: 30, labelGap: 22 } as const;
/** From the title's baseline down to the top of the orange rule under it, and its height. */
const RULE = { below: 34, height: 5, width: 64 } as const;
/** Below the last line of a text, room is kept for letters that reach under the baseline. */
const DESCENT = 0.27;

/**
 * A widget's height on the card, in pixels at `unit` (pixels per 1080th of the shorter side):
 * a text down to the bottom of its rule; a value its number's line, and the line of its words
 * when they are above or under it.
 */
export function totalsWidgetHeight(widget: Widget, unit: number): number {
  const scale = widget.size / 100;
  if (widget.kind === 'text') return (SIZES.title + RULE.below + RULE.height) * unit * scale;
  const size = widget.kind === 'metric' && widget.metric === 'date' ? SIZES.dates : SIZES.value;
  const words = widget.kind === 'metric' && (widget.label === 'above' || widget.label === 'under');
  if (!words) return size * (1 + DESCENT) * unit * scale;
  return (size + SIZES.labelGap + SIZES.label * (1 + DESCENT)) * unit * scale;
}

/**
 * The values a totals card can show, at their final numbers, by field; a time or a date in
 * each of its formats too.
 */
export function totalsValues(
  totals: Totals,
  countLabel: [string, string],
  units: Units,
): Map<TotalsField, MetricValue> {
  const values = new Map<TotalsField, MetricValue>();
  for (const field of TOTALS_FIELDS) {
    if (totals.activities === 1 && SEVERAL_ONLY(field)) continue;
    const shown = totalsEntry(totals, field, { f: 1, countLabel, units });
    if (!shown) continue;
    const { value, number, label, name } = shown;
    const formats: Partial<Record<ValueFormat, MetricText>> = {};
    for (const format of formatsOf(field)) {
      const entry = totalsEntry(totals, field, { f: 1, countLabel, units, format });
      if (entry) formats[format] = { value: entry.value, number: entry.number, label: entry.label };
    }
    values.set(field, {
      value,
      number,
      label,
      name,
      ...(Object.keys(formats).length ? { formats } : {}),
    });
  }
  return values;
}

const smoothstep = (f: number) => f * f * (3 - 2 * f);
const easeOut = (f: number) => 1 - (1 - f) ** 3;
const progress = (t: number, at: number, length: number) =>
  Math.min(1, Math.max(0, (t - at) / length));
const wholeNumber = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * A value of the totals card as shown: its number with the unit, its number alone, its words
 * and its name.
 */
export type TotalsEntry = {
  field: TotalsField;
  value: string;
  number: string;
  label: string;
  name: string;
};

/** The values of `fields` in their order, written their usual way (see `totalsEntry`). */
export function totalsEntries(
  totals: Totals,
  f: number,
  countLabel: [string, string],
  fields: readonly TotalsField[],
  units: Units,
): TotalsEntry[] {
  return fields.flatMap((field) => totalsEntry(totals, field, { f, countLabel, units }) ?? []);
}

/**
 * A value of the totals card, as a value widget over the replay shows it at the end ("312 km",
 * "total distance"), in `units` and in `format` (else its usual one, for a time hours), its
 * number shown at a share `f` of its count-up; the pace, the top speed and the dates do not
 * count up. Null for a value the activities did not record: the climb, the descent and the
 * elevations without elevation, the sensor values and calories without them.
 */
export function totalsEntry(
  totals: Totals,
  field: TotalsField,
  {
    f,
    countLabel,
    units,
    format = defaultFormat(field, true) ?? undefined,
  }: { f: number; countLabel: [string, string]; units: Units; format?: ValueFormat },
): TotalsEntry | null {
  const ride = countLabel[0];
  const timeFormat = TIME_FORMATS.includes(format as TimeFormat) ? (format as TimeFormat) : 'h';
  const dateFormat = DATE_FORMATS.includes(format as DateFormat) ? (format as DateFormat) : 'dmy';
  const duration = (seconds: number) => durationText(seconds * f, timeFormat);
  const distance = (meters: number, decimals = 0) => {
    const value = inDistanceUnits(meters, units) * f;
    return `${decimals ? value.toFixed(decimals) : wholeNumber(value)} ${distanceUnit(units)}`;
  };
  const height = (meters: number) =>
    `${wholeNumber(inHeightUnits(meters, units) * f)} ${heightUnit(units)}`;
  const whole = (n: number) => wholeNumber(n * f);
  /** For several activities a plain value is their total: "Total distance". */
  const total = (name: string) => (totals.activities > 1 ? `Total ${name.toLowerCase()}` : name);
  const entry = (field: TotalsField, value: string, name: string, label = name.toLowerCase()) => [
    { field, value, number: numberOf(field, value), label, name },
  ];
  /** Each activity's average, most and least: "62.5 km / avg distance per ride". */
  const perActivity = (
    field: TotalsField,
    values: number[] | null,
    text: (value: number) => string,
    what: string,
  ): TotalsEntry[] => {
    if (!values?.length) return [];
    const which = field.slice(0, 3) as 'avg' | 'max' | 'min';
    const value =
      which === 'avg'
        ? values.reduce((sum, v) => sum + v, 0) / values.length
        : which === 'max'
          ? Math.max(...values)
          : Math.min(...values);
    const name = `${which[0]!.toUpperCase()}${which.slice(1)} ${what} per activity`;
    return entry(field, text(value), name, `${which} ${what} per ${ride}`);
  };
  const sensor = (
    field: TotalsField,
    channel: 'heartRate' | 'power' | 'cadence' | 'temperature',
    value: number | null,
    which: 'avg' | 'max' | 'min',
    what: string,
  ): TotalsEntry[] => {
    if (value === null) return [];
    const name = `${which[0]!.toUpperCase()}${which.slice(1)} ${what}`;
    return entry(field, sensorValueText(channel, value * f, totals.onFoot, units), name);
  };
  const speed = (shown: { value: string; unit: string }, which: 'Avg' | 'Max') =>
    entry(
      field,
      `${shown.value} ${shown.unit}`,
      `${which} ${shown.unit.startsWith('/') ? 'pace' : 'speed'}`,
    );
  const entries = ((): TotalsEntry[] => {
    switch (field) {
      case 'count':
        return entry(
          field,
          whole(totals.activities),
          'Total activities',
          totals.activities === 1 ? countLabel[0] : countLabel[1],
        );
      case 'time':
        return entry(field, duration(totals.totalSeconds), total('Time'));
      case 'moving':
        return entry(field, duration(totals.movingSeconds), total('Moving time'));
      case 'avg-time':
      case 'max-time':
      case 'min-time':
        return perActivity(field, totals.each.seconds, duration, 'time');
      case 'distance':
        return entry(field, distance(totals.meters), total('Distance'));
      case 'avg-distance':
      case 'max-distance':
      case 'min-distance':
        return perActivity(field, totals.each.meters, (v) => distance(v, 1), 'distance');
      case 'avg-speed':
        return speed(averagePace(totals.onFoot, totals.movingSeconds, totals.meters, units), 'Avg');
      case 'max-speed':
        return speed(topSpeed(totals.onFoot, totals.topSpeed, units), 'Max');
      case 'climb':
        return totals.climbed === null ? [] : entry(field, height(totals.climbed), total('Climb'));
      case 'descent':
        return totals.descended === null
          ? []
          : entry(field, height(totals.descended), total('Descent'));
      case 'avg-climb':
      case 'max-climb':
      case 'min-climb':
        return perActivity(field, totals.each.climbed, height, 'climb');
      case 'max-elevation':
        return totals.highest === null ? [] : entry(field, height(totals.highest), 'Max elevation');
      case 'min-elevation':
        return totals.lowest === null ? [] : entry(field, height(totals.lowest), 'Min elevation');
      case 'avg-heart-rate':
        return sensor(field, 'heartRate', totals.heartRate, 'avg', 'heart rate');
      case 'max-heart-rate':
        return sensor(field, 'heartRate', totals.maxHeartRate, 'max', 'heart rate');
      case 'min-heart-rate':
        return sensor(field, 'heartRate', totals.minHeartRate, 'min', 'heart rate');
      case 'avg-power':
        return sensor(field, 'power', totals.power, 'avg', 'power');
      case 'max-power':
        return sensor(field, 'power', totals.maxPower, 'max', 'power');
      case 'avg-cadence':
        return sensor(field, 'cadence', totals.cadence, 'avg', 'cadence');
      case 'max-cadence':
        return sensor(field, 'cadence', totals.maxCadence, 'max', 'cadence');
      case 'avg-temperature':
        return sensor(field, 'temperature', totals.temperature, 'avg', 'temperature');
      case 'min-temperature':
        return sensor(field, 'temperature', totals.minTemperature, 'min', 'temperature');
      case 'max-temperature':
        return sensor(field, 'temperature', totals.maxTemperature, 'max', 'temperature');
      case 'calories':
        return totals.calories === null
          ? []
          : entry(field, `${whole(totals.calories)} kcal`, total('Calories'));
      case 'avg-calories':
      case 'max-calories':
      case 'min-calories':
        return perActivity(field, totals.each.calories, (v) => `${whole(v)} kcal`, 'calories');
      case 'days':
        return entry(field, whole(totals.days), 'Days', totals.days === 1 ? 'day' : 'days');
      case 'moving-days':
        return entry(
          field,
          whole(totals.movingDays),
          'Moving days',
          totals.movingDays === 1 ? 'moving day' : 'moving days',
        );
      case 'date':
        return entry(field, dateSpan(totals.firstStart, totals.lastStart, dateFormat), 'Date', '');
    }
  })();
  return entries[0] ?? null;
}

/**
 * Draws the totals card `t` seconds after the replay ended, over `last`, a copy of the
 * replay's last frame: the map dims, the text widgets fade in, and the values fade in one
 * after another, in their order, and count up. Each widget is centered on its point.
 */
export function drawTotalsCard(
  ctx: Context2DLike,
  last: CanvasLike,
  t: number,
  totals: Totals,
  {
    width: W,
    height: H,
    fontFamily,
    title,
    countLabel,
    units,
    widgets,
    hideWidgets = false,
  }: TotalsCardOptions,
): void {
  const unit = Math.min(W, H) / 1080;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(last, 0, 0);
  ctx.globalAlpha = DIM * smoothstep(progress(t, TIMING.dim.at, TIMING.dim.length));
  ctx.fillStyle = '#050608';
  ctx.fillRect(0, 0, W, H);

  const f = easeOut(progress(t, TIMING.count.at, TIMING.count.length));
  /** The widgets with something to show: a text, or a value the activities have. */
  const shown = widgets.flatMap(
    (widget): { widget: Widget; text: string; entry: TotalsEntry | null; widest: string }[] => {
      if (widget.kind === 'text') {
        const text = widget.text ?? title;
        return text ? [{ widget, text, entry: null, widest: text }] : [];
      }
      const entry =
        widget.kind === 'metric'
          ? totalsEntry(totals, widget.metric as TotalsField, {
              f,
              countLabel,
              units,
              format: widget.format,
            })
          : null;
      if (!entry) return [];
      // Its own words in place of the usual ones, and the number without its unit when asked.
      if (widget.kind !== 'metric') return [];
      const label = widget.labelText ?? entry.label;
      const value = widget.unit === false ? entry.number : entry.value;
      // Its number at the end of the count, which it is laid out by, so nothing moves as the
      // number counts up.
      const final = totalsEntry(totals, widget.metric as TotalsField, {
        f: 1,
        countLabel,
        units,
        format: widget.format,
      })!;
      const widest = widget.unit === false ? final.number : final.value;
      return [{ widget, text: '', entry: { ...entry, label, value }, widest }];
    },
  );
  if (shown.length === 0) return;
  const topOf = (widget: Widget) => (widget.y / 100) * H - totalsWidgetHeight(widget, unit) / 2;

  // Darker still behind the widgets, fading out above and below them, so place names on the
  // map do not show through the numbers.
  const room = 120 * unit;
  const top = Math.min(...shown.map(({ widget }) => topOf(widget)));
  const bottom = Math.max(
    ...shown.map(({ widget }) => topOf(widget) + totalsWidgetHeight(widget, unit)),
  );
  const band = ctx.createLinearGradient(0, top - room, 0, bottom + room);
  band.addColorStop(0, 'rgba(5, 6, 8, 0)');
  band.addColorStop(0.25, 'rgba(5, 6, 8, 0.75)');
  band.addColorStop(0.75, 'rgba(5, 6, 8, 0.75)');
  band.addColorStop(1, 'rgba(5, 6, 8, 0)');
  ctx.globalAlpha = smoothstep(progress(t, TIMING.dim.at, TIMING.dim.length));
  ctx.fillStyle = band;
  ctx.fillRect(0, top - room, W, bottom - top + 2 * room);
  ctx.globalAlpha = 1;
  if (hideWidgets) return;

  /** Sets the font at `size`, or smaller when `text` would be wider than `width`. */
  const fitFont = (text: string, weight: number, size: number, width: number) => {
    ctx.font = `${weight} ${Math.round(size)}px ${fontFamily}`;
    const measured = ctx.measureText(text).width;
    if (measured > width)
      ctx.font = `${weight} ${Math.floor((size * width) / measured)}px ${fontFamily}`;
  };
  // As wide as a value may be: a column's, of as many columns as the values would fill.
  const numbers = shown.filter(({ entry }) => entry && entry.field !== 'date').length;
  const perRow = W > H * 1.3 ? Math.min(4, Math.max(1, numbers)) : 2;
  const columnWidth = Math.min(W * 0.4, (W * 0.86) / perRow);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let order = 0;
  for (const { widget, text, entry, widest } of shown) {
    const scale = widget.size / 100;
    const x = (widget.x / 100) * W;
    const widgetTop = topOf(widget);
    if (!entry) {
      const size = SIZES.title * unit * scale;
      const shownPart = smoothstep(progress(t, TIMING.title.at, TIMING.title.length));
      ctx.globalAlpha = shownPart;
      ctx.font = `600 ${Math.round(size)}px ${fontFamily}`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.fillText(text, x, widgetTop + size, W * 0.88);
      // A short orange rule under it.
      ctx.fillStyle = '#ff8a2a';
      const rule = RULE.width * unit * scale * shownPart;
      ctx.fillRect(
        x - rule / 2,
        widgetTop + size + RULE.below * unit * scale,
        rule,
        RULE.height * unit * scale,
      );
      continue;
    }
    const dates = entry.field === 'date';
    const size = (dates ? SIZES.dates : SIZES.value) * unit * scale;
    const labelSize = SIZES.label * unit * scale;
    const width = Math.min(W * 0.96, (dates ? W * 0.86 : columnWidth * 0.92) * scale);
    const shownPart = smoothstep(
      progress(t, TIMING.values.at + order * TIMING.values.stagger, TIMING.values.length),
    );
    order++;
    const rise = (1 - shownPart) * 24 * unit;
    const gap = SIZES.labelGap * unit * scale;
    const mode = entry.label && widget.kind === 'metric' ? widget.label : 'off';
    ctx.globalAlpha = shownPart;
    const icon = widget.kind === 'metric' && widget.icon ? iconOf(widget.metric) : null;
    /** Draws the number, white, centered on `x` with its baseline at `y`, its icon before it. */
    const number = (y: number) => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
      // Set by the number as it ends, both smaller when too wide, so nothing moves while it
      // counts up: the icon at the left, the unit at the right, the number against the unit.
      ctx.font = `700 ${Math.round(size)}px ${fontFamily}`;
      const room = (px: number) => (icon ? iconRoom(px) : 0);
      const k = Math.min(1, width / (room(size) + ctx.measureText(widest).width));
      const fontSize = size * k;
      ctx.font = `700 ${Math.round(fontSize)}px ${fontFamily}`;
      const full = room(fontSize) + ctx.measureText(widest).width;
      const left = x - full / 2;
      const right = left + full;
      if (icon) drawIconBefore(ctx, icon, left, y, fontSize);
      const digits = entry.value.startsWith(entry.number) ? entry.number : entry.value;
      const unit = entry.value.slice(digits.length);
      ctx.textAlign = 'right';
      ctx.fillText(unit, right, y);
      ctx.fillText(digits, right - ctx.measureText(unit).width, y);
      ctx.textAlign = 'center';
    };
    /** Draws the words, smaller in orange, centered on `x` with their baseline at `y`. */
    const words = (y: number) => {
      fitFont(entry.label, 500, labelSize, width);
      ctx.fillStyle = 'rgba(255, 176, 102, 0.9)';
      ctx.fillText(entry.label, x, y);
    };
    if (mode === 'off') number(widgetTop + size + rise);
    else if (mode === 'under') {
      number(widgetTop + size + rise);
      words(widgetTop + size + gap + labelSize + rise);
    } else if (mode === 'above') {
      words(widgetTop + labelSize + rise);
      number(widgetTop + labelSize * (1 + DESCENT) + gap + size + rise);
    } else
      drawBeside(entry, widest, mode, icon, x, widgetTop + size + rise, size, labelSize, width);
  }
  ctx.globalAlpha = 1;

  /**
   * Draws the number and its words on one line, the words before or after it, smaller and in
   * orange on the same baseline, after the icon when it has one, all together centered on `x`
   * and no wider than `width`.
   */
  function drawBeside(
    entry: TotalsEntry,
    widest: string,
    mode: 'before' | 'after',
    icon: IconName | null,
    x: number,
    y: number,
    size: number,
    labelSize: number,
    width: number,
  ): void {
    const numberFont = (k: number) => `700 ${Math.round(size * k)}px ${fontFamily}`;
    const wordsFont = (k: number) => `500 ${Math.round(labelSize * k)}px ${fontFamily}`;
    const measure = (k: number) => {
      ctx.font = numberFont(k);
      // Laid out by the number as it ends, so nothing moves while it counts up.
      const n = ctx.measureText(widest).width;
      ctx.font = wordsFont(k);
      const w = ctx.measureText(entry.label).width;
      return { n, w, space: labelSize * k * 0.35, room: icon ? iconRoom(size * k) : 0 };
    };
    const full = measure(1);
    const k = Math.min(1, width / (full.room + full.n + full.space + full.w));
    const { n, w, space, room } = k < 1 ? measure(k) : full;
    const left = x - (room + n + space + w) / 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    if (icon) drawIconBefore(ctx, icon, left, y, size * k);
    const start = left + room;
    const [numberX, wordsX] =
      mode === 'before' ? [start + w + space, start] : [start, start + n + space];
    ctx.textAlign = 'left';
    ctx.font = numberFont(k);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.fillText(entry.value, numberX, y);
    ctx.font = wordsFont(k);
    ctx.fillStyle = 'rgba(255, 176, 102, 0.9)';
    ctx.fillText(entry.label, wordsX, y);
    ctx.textAlign = 'center';
  }
}
