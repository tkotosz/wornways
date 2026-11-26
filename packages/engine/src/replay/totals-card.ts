// The totals card after the replay of several activities: the finished map dims, the
// video's title comes in, and the totals count up. What it shows is a list of widgets, as
// over the replay (see widgets.ts): text, and the totals as values, each centered on its
// point; at first the title over activities, kilometers, hours moving and meters climbed.
// It is added after the replay and before the end card, so the replay keeps the length it
// was given.

import { averagePace, topSpeed } from './pace.ts';
import {
  DATE_FORMATS,
  TIME_FORMATS,
  dateSpan,
  defaultFormat,
  distanceUnit,
  durationParts,
  formatsOf,
  heightUnit,
  inDistanceUnits,
  inHeightUnits,
  type DateFormat,
  type TimeFormat,
  type Units,
  type ValueFormat,
} from './formats.ts';
import { METRICS, SINGLE_ONLY, type Metric, type MetricText, type MetricValue } from './metrics.ts';
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
   * metric is one of `TOTALS_FIELDS`). See `startingTotalsWidgets` for the usual ones.
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
 * a text down to the bottom of its rule; a value from the top of its number's line down to
 * below the words under it.
 */
export function totalsWidgetHeight(widget: Widget, unit: number): number {
  const scale = widget.size / 100;
  if (widget.kind === 'text') return (SIZES.title + RULE.below + RULE.height) * unit * scale;
  const size = widget.kind === 'metric' && widget.metric === 'date' ? SIZES.dates : SIZES.value;
  return (size + SIZES.labelGap + SIZES.label * (1 + DESCENT)) * unit * scale;
}

/**
 * The widgets a totals card starts with: the title at the top, then the values in rows, up to
 * four to a row on a wide frame and two otherwise, a last short row centered; the dates are
 * too long to share a row, so they get one of their own where they sit in the order. The block
 * is centered on the frame. `fields` are the values to show, in order; `title` whether the
 * video has one.
 */
export function startingTotalsWidgets(
  fields: readonly TotalsField[],
  title: boolean,
  { width: W, height: H }: { width: number; height: number },
): Widget[] {
  const unit = Math.min(W, H) / 1080;
  const numbers = fields.filter((field) => field !== 'date').length;
  const perRow = W > H * 1.3 ? Math.min(4, Math.max(1, numbers)) : 2;
  const rows: { fields: TotalsField[]; dates: boolean }[] = [];
  for (const field of fields) {
    const last = rows.at(-1);
    if (field === 'date') rows.push({ fields: [field], dates: true });
    else if (last && !last.dates && last.fields.length < perRow) last.fields.push(field);
    else rows.push({ fields: [field], dates: false });
  }
  const gap = 70 * unit;
  const rowHeight = (dates: boolean) =>
    (dates ? SIZES.dates : SIZES.value) * unit + SIZES.label * unit + gap;
  const titleRoom = title ? (SIZES.title + 90) * unit : 0;
  const blockHeight = titleRoom + rows.reduce((sum, row) => sum + rowHeight(row.dates), 0) - gap;
  const top = (H - blockHeight) / 2;
  const columnWidth = Math.min(W * 0.4, (W * 0.86) / perRow);

  const widgets: Widget[] = [];
  if (title) {
    const widget: Widget = { kind: 'text', text: null, x: 50, y: 0, size: 100 };
    widget.y = ((top + totalsWidgetHeight(widget, unit) / 2) / H) * 100;
    widgets.push(widget);
  }
  let rowTop = top + titleRoom;
  for (const row of rows) {
    row.fields.forEach((field, column) => {
      const widget: Widget = {
        kind: 'metric',
        metric: field,
        label: 'under',
        x: 0,
        y: 0,
        size: 100,
      };
      widget.x = ((W / 2 + (column - (row.fields.length - 1) / 2) * columnWidth) / W) * 100;
      widget.y = ((rowTop + totalsWidgetHeight(widget, unit) / 2) / H) * 100;
      widgets.push(widget);
    });
    rowTop += rowHeight(row.dates);
  }
  return widgets;
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
    const shown = totalsEntry(totals, field, { f: 1, countLabel, units });
    if (!shown) continue;
    const { value, label, name } = shown;
    const formats: Partial<Record<ValueFormat, MetricText>> = {};
    for (const format of formatsOf(field)) {
      const entry = totalsEntry(totals, field, { f: 1, countLabel, units, format });
      if (entry) formats[format] = { value: entry.value, label: entry.label };
    }
    values.set(field, { value, label, name, ...(Object.keys(formats).length ? { formats } : {}) });
  }
  return values;
}

const smoothstep = (f: number) => f * f * (3 - 2 * f);
const easeOut = (f: number) => 1 - (1 - f) ** 3;
const progress = (t: number, at: number, length: number) =>
  Math.min(1, Math.max(0, (t - at) / length));
const wholeNumber = (n: number) => Math.round(n).toLocaleString('en-US');

/** A value of the totals card as shown: its text and the label under it. */
export type TotalsEntry = { field: TotalsField; value: string; label: string; name: string };

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
 * A value of the totals card with its label, in `units` and in `format` (else its usual one),
 * its number shown at a share `f` of its count-up; the pace, the top speed and the dates do not
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
  /** A length of time as counted up so far, and its unit in words: "hours", "days" or none. */
  const duration = (seconds: number) => {
    const { value, unit } = durationParts(seconds * f, timeFormat);
    return { value, unit: unit === 'h' ? 'hours' : unit };
  };
  const distance = (meters: number, decimals = 0) => {
    const value = inDistanceUnits(meters, units) * f;
    return decimals ? value.toFixed(decimals) : wholeNumber(value);
  };
  const height = (meters: number) => wholeNumber(inHeightUnits(meters, units) * f);
  const km = distanceUnit(units);
  const m = heightUnit(units);
  const whole = (n: number) => wholeNumber(n * f);
  const entry = (field: TotalsField, value: string, label: string, name: string): TotalsEntry => ({
    field,
    value,
    label,
    name,
  });
  /** Each activity's average, most and least: "62.5 / km avg per ride". */
  const perActivity = (
    field: TotalsField,
    values: number[] | null,
    text: (value: number) => string,
    unit: string | ((value: number) => { value: string; unit: string }),
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
    if (typeof unit === 'string')
      return [entry(field, text(value), `${unit} ${which} per ${ride}`, name)];
    // A time: its unit in the words, or "avg time per ride" for 54:38.
    const shown = unit(value);
    const words = shown.unit
      ? `${shown.unit} ${which} per ${ride}`
      : `${which} ${what} per ${ride}`;
    return [entry(field, shown.value, words, name)];
  };
  const sensor = (
    field: TotalsField,
    channel: 'heartRate' | 'power' | 'cadence' | 'temperature',
    value: number | null,
    which: 'avg' | 'max' | 'min',
    what: string,
  ): TotalsEntry[] => {
    if (value === null) return [];
    const [number, unit] = sensorValueText(channel, value * f, totals.onFoot, units).split(' ');
    const name = `${which[0]!.toUpperCase()}${which.slice(1)} ${what}`;
    return [entry(field, number!, `${unit} ${which} ${what}`, name)];
  };
  const entries = ((): TotalsEntry[] => {
    switch (field) {
      case 'count':
        return [
          entry(
            field,
            whole(totals.activities),
            totals.activities === 1 ? countLabel[0] : countLabel[1],
            'Total activities',
          ),
        ];
      case 'time': {
        const { value, unit } = duration(totals.totalSeconds);
        return [entry(field, value, `${unit || 'time'} in total`, 'Total time')];
      }
      case 'moving': {
        const { value, unit } = duration(totals.movingSeconds);
        return [
          entry(field, value, `${unit ? `${unit} ` : ''}moving in total`, 'Total moving time'),
        ];
      }
      case 'avg-time':
      case 'max-time':
      case 'min-time':
        return perActivity(field, totals.each.seconds, String, duration, 'time');
      case 'distance':
        return [entry(field, distance(totals.meters), `${km} in total`, 'Total distance')];
      case 'avg-distance':
      case 'max-distance':
      case 'min-distance':
        return perActivity(field, totals.each.meters, (v) => distance(v, 1), km, 'distance');
      case 'avg-speed': {
        const { value, unit } = averagePace(
          totals.onFoot,
          totals.movingSeconds,
          totals.meters,
          units,
        );
        return unit.startsWith('/')
          ? [entry(field, value, `min${unit} avg pace`, 'Avg pace')]
          : [entry(field, value, `${unit} avg speed`, 'Avg speed')];
      }
      case 'max-speed': {
        const { value, unit } = topSpeed(totals.onFoot, totals.topSpeed, units);
        return unit.startsWith('/')
          ? [entry(field, value, `min${unit} max pace`, 'Max pace')]
          : [entry(field, value, `${unit} max speed`, 'Max speed')];
      }
      case 'climb':
        return totals.climbed === null
          ? []
          : [entry(field, height(totals.climbed), `${m} climbed in total`, 'Total climb')];
      case 'descent':
        return totals.descended === null
          ? []
          : [entry(field, height(totals.descended), `${m} descended in total`, 'Total descent')];
      case 'avg-climb':
      case 'max-climb':
      case 'min-climb':
        return perActivity(field, totals.each.climbed, height, `${m} climbed`, 'climb');
      case 'max-elevation':
        return totals.highest === null
          ? []
          : [entry(field, height(totals.highest), `${m} max elevation`, 'Max elevation')];
      case 'min-elevation':
        return totals.lowest === null
          ? []
          : [entry(field, height(totals.lowest), `${m} min elevation`, 'Min elevation')];
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
          : [entry(field, whole(totals.calories), 'kcal in total', 'Total calories')];
      case 'avg-calories':
      case 'max-calories':
      case 'min-calories':
        return perActivity(field, totals.each.calories, whole, 'kcal', 'calories');
      case 'days':
        return [entry(field, whole(totals.days), totals.days === 1 ? 'day' : 'days', 'Days')];
      case 'moving-days':
        return [
          entry(
            field,
            whole(totals.movingDays),
            totals.movingDays === 1 ? 'moving day' : 'moving days',
            'Moving days',
          ),
        ];
      case 'date':
        return [
          entry(field, dateSpan(totals.firstStart, totals.lastStart, dateFormat), 'dates', 'Date'),
        ];
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
    (widget): { widget: Widget; text: string; entry: TotalsEntry | null }[] => {
      if (widget.kind === 'text') {
        const text = widget.text ?? title;
        return text ? [{ widget, text, entry: null }] : [];
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
      // Its own words in place of the usual ones, which say the unit.
      const label =
        widget.kind === 'metric' && widget.labelText !== undefined ? widget.labelText : entry.label;
      return [{ widget, text: '', entry: { ...entry, label } }];
    },
  );
  if (shown.length === 0) return;
  const topOf = (widget: Widget) => (widget.y / 100) * H - totalsWidgetHeight(widget, unit) / 2;

  // Darker still behind the widgets, fading out above and below them, so place names on the
  // map do not show through the numbers.
  const room = 120 * unit;
  const top = Math.min(...shown.map(({ widget }) => topOf(widget)));
  const bottom = Math.max(
    ...shown.map(({ widget, entry }) => {
      const scale = widget.size / 100;
      const size = entry ? (entry.field === 'date' ? SIZES.dates : SIZES.value) : SIZES.title;
      // A text's rule and a value's words reach a little further than the band needs to.
      return topOf(widget) + (entry ? size + SIZES.label : size + 20) * unit * scale;
    }),
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
  for (const { widget, text, entry } of shown) {
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
    const y = widgetTop + size + (1 - shownPart) * 24 * unit;
    ctx.globalAlpha = shownPart;
    fitFont(entry.value, 700, size, width);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.fillText(entry.value, x, y);
    fitFont(entry.label, 500, labelSize, width);
    ctx.fillStyle = 'rgba(255, 176, 102, 0.9)';
    ctx.fillText(entry.label, x, y + labelSize + SIZES.labelGap * unit * scale);
  }
  ctx.globalAlpha = 1;
}
