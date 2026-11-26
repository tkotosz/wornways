// The totals card after the replay of several activities: the finished map dims, the
// video's title comes in, and the totals count up. What it shows is a list of widgets, as
// over the replay (see widgets.ts): text, and the totals as values, each centered on its
// point; at first the title over activities, kilometers, hours moving and meters climbed.
// It is added after the replay and before the end card, so the replay keeps the length it
// was given.

import { averagePace, topSpeed } from './pace.ts';
import type { CanvasLike, Context2DLike } from './render.ts';
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
 * A value the totals card can show. The names are the metrics card's for the same values:
 * - count: the number of activities
 * - distance: kilometers
 * - moving: hours moving; time: hours in total, stops included
 * - elevation: meters climbed; descent: meters descended; highest: the highest point
 * - pace: the average pace or speed while moving; top-speed: the top speed
 * - date: the days the activities span; days: the days with an activity
 * - lowest: the lowest point; biggest-climb: the most climbed in one activity
 * - longest: the longest activity's kilometers; longest-time: the longest by time;
 *   average-distance: kilometers per activity
 * - heart-rate, power, cadence, temperature: their averages over time; max-heart-rate,
 *   max-power, max-cadence, max-temperature: the highest; min-temperature: the lowest;
 *   calories: the kilocalories, for the activities that recorded them
 */
export type TotalsField =
  | 'count'
  | 'distance'
  | 'moving'
  | 'time'
  | 'elevation'
  | 'descent'
  | 'highest'
  | 'lowest'
  | 'biggest-climb'
  | 'pace'
  | 'top-speed'
  | 'date'
  | 'days'
  | 'longest'
  | 'longest-time'
  | 'average-distance'
  | 'heart-rate'
  | 'max-heart-rate'
  | 'power'
  | 'max-power'
  | 'cadence'
  | 'max-cadence'
  | 'temperature'
  | 'min-temperature'
  | 'max-temperature'
  | 'calories';
/** Every value of the totals card, in the order the settings list them. */
export const TOTALS_FIELDS: readonly TotalsField[] = [
  'count',
  'distance',
  'moving',
  'time',
  'elevation',
  'descent',
  'highest',
  'lowest',
  'biggest-climb',
  'pace',
  'top-speed',
  'date',
  'days',
  'longest',
  'longest-time',
  'average-distance',
  'heart-rate',
  'max-heart-rate',
  'power',
  'max-power',
  'cadence',
  'max-cadence',
  'temperature',
  'min-temperature',
  'max-temperature',
  'calories',
];
/** The values the totals card shows unless told otherwise, in this order. */
export const AUTOMATIC_TOTALS: readonly TotalsField[] = [
  'count',
  'distance',
  'moving',
  'elevation',
];

export type Totals = {
  activities: number;
  meters: number;
  /** Seconds moving: the stretches between points covered at walking speed or faster. */
  movingSeconds: number;
  /** Seconds from each activity's first point to its last, added up. */
  totalSeconds: number;
  /** Meters climbed; null when no activity recorded elevation. */
  climbed: number | null;
  /** Meters descended; null when no activity recorded elevation. */
  descended: number | null;
  /** The highest elevation reached, in meters; null when no activity recorded elevation. */
  highest: number | null;
  /** The lowest elevation reached, in meters; null when no activity recorded elevation. */
  lowest: number | null;
  /** The most meters one activity climbed; null when no activity recorded elevation. */
  biggestClimb: number | null;
  /** How many calendar days have an activity starting on them. */
  days: number;
  /** The longest activity's meters. */
  longest: number;
  /** The longest activity's seconds, stops included. */
  longestSeconds: number;
  /** The top speed of any activity, in meters per second (see `TOP_SPEED_WINDOW_S`). */
  topSpeed: number;
  /**
   * Averages over time of the activities that recorded them, the highest, and the lowest
   * temperature; null when none did. Cadence is in rotations per minute (one leg's strides
   * on foot).
   */
  heartRate: number | null;
  maxHeartRate: number | null;
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
  /** The days the activities span, e.g. "18–22 Apr 2026". */
  dates: string;
};

export type TotalsCardOptions = {
  width: number;
  height: number;
  fontFamily: string;
  /** The video's title, which a text widget without its own text shows; empty for none. */
  title: string;
  /** Singular and plural noun for the count, e.g. ["ride", "rides"]. */
  countLabel: [string, string];
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

/** The values a totals card can show, at their final numbers, by field. */
export function totalsValues(
  totals: Totals,
  countLabel: [string, string],
): Map<TotalsField, { value: string; label: string }> {
  return new Map(
    totalsEntries(totals, 1, countLabel, TOTALS_FIELDS).map((entry) => [
      entry.field,
      { value: entry.value, label: entry.label },
    ]),
  );
}

const smoothstep = (f: number) => f * f * (3 - 2 * f);
const easeOut = (f: number) => 1 - (1 - f) ** 3;
const progress = (t: number, at: number, length: number) =>
  Math.min(1, Math.max(0, (t - at) / length));
const wholeNumber = (n: number) => Math.round(n).toLocaleString('en-US');

/** A value of the totals card as shown: its text and the label under it. */
export type TotalsEntry = { field: TotalsField; value: string; label: string };

/**
 * The values of `fields` in their order, with their labels, the numbers shown at a share `f`
 * of their count-up; the pace, the top speed and the dates do not count up. The climb, the
 * descent and the highest point are left out when no activity recorded elevation, the sensor
 * values and calories when none recorded them.
 */
export function totalsEntries(
  totals: Totals,
  f: number,
  countLabel: [string, string],
  fields: readonly TotalsField[] = AUTOMATIC_TOTALS,
): TotalsEntry[] {
  const hours = (seconds: number) => {
    const h = seconds / 3600;
    return h < 10 ? (h * f).toFixed(1) : wholeNumber(h * f);
  };
  return fields.flatMap((field) => {
    switch (field) {
      case 'count':
        return {
          field,
          value: wholeNumber(totals.activities * f),
          label: totals.activities === 1 ? countLabel[0] : countLabel[1],
        };
      case 'distance':
        return { field, value: wholeNumber((totals.meters / 1000) * f), label: 'km' };
      case 'moving':
        return { field, value: hours(totals.movingSeconds), label: 'hours moving' };
      case 'time':
        return { field, value: hours(totals.totalSeconds), label: 'hours in total' };
      case 'elevation':
        return totals.climbed === null
          ? []
          : { field, value: wholeNumber(totals.climbed * f), label: 'm climbed' };
      case 'descent':
        return totals.descended === null
          ? []
          : { field, value: wholeNumber(totals.descended * f), label: 'm descended' };
      case 'highest':
        return totals.highest === null
          ? []
          : { field, value: wholeNumber(totals.highest * f), label: 'm highest point' };
      case 'lowest':
        return totals.lowest === null
          ? []
          : { field, value: wholeNumber(totals.lowest * f), label: 'm lowest point' };
      case 'biggest-climb':
        return totals.biggestClimb === null
          ? []
          : { field, value: wholeNumber(totals.biggestClimb * f), label: 'm biggest climb' };
      case 'longest-time':
        return { field, value: hours(totals.longestSeconds), label: 'hours longest' };
      case 'average-distance':
        return {
          field,
          value: ((totals.meters / 1000 / totals.activities) * f).toFixed(1),
          label: `km per ${countLabel[0]}`,
        };
      case 'days':
        return {
          field,
          value: wholeNumber(totals.days * f),
          label: totals.days === 1 ? 'day out' : 'days out',
        };
      case 'longest':
        return {
          field,
          value: wholeNumber((totals.longest / 1000) * f),
          label: `km longest ${countLabel[0]}`,
        };
      case 'pace': {
        const { value, unit } = averagePace(totals.onFoot, totals.movingSeconds, totals.meters);
        return { field, value, label: unit === '/km' ? 'min/km average' : 'km/h average' };
      }
      case 'top-speed': {
        const { value, unit } = topSpeed(totals.onFoot, totals.topSpeed);
        return { field, value, label: unit === '/km' ? 'min/km best pace' : 'km/h top speed' };
      }
      case 'date':
        return { field, value: totals.dates, label: 'dates' };
      case 'heart-rate':
        return totals.heartRate === null
          ? []
          : { field, value: wholeNumber(totals.heartRate * f), label: 'bpm average' };
      case 'max-heart-rate':
        return totals.maxHeartRate === null
          ? []
          : { field, value: wholeNumber(totals.maxHeartRate * f), label: 'bpm max' };
      case 'power':
      case 'max-power': {
        const power = field === 'power' ? totals.power : totals.maxPower;
        if (power === null) return [];
        return {
          field,
          value: wholeNumber(power * f),
          label: field === 'power' ? 'W average' : 'W max',
        };
      }
      case 'cadence':
      case 'max-cadence': {
        const cadence = field === 'cadence' ? totals.cadence : totals.maxCadence;
        if (cadence === null) return [];
        const which = field === 'cadence' ? 'average' : 'max';
        return totals.onFoot
          ? { field, value: wholeNumber(cadence * 2 * f), label: `spm ${which}` }
          : { field, value: wholeNumber(cadence * f), label: `rpm ${which}` };
      }
      case 'temperature':
      case 'min-temperature':
      case 'max-temperature': {
        const which =
          field === 'temperature' ? 'average' : field === 'min-temperature' ? 'min' : 'max';
        const value =
          which === 'average'
            ? totals.temperature
            : which === 'min'
              ? totals.minTemperature
              : totals.maxTemperature;
        return value === null ? [] : { field, value: wholeNumber(value * f), label: `°C ${which}` };
      }
      case 'calories':
        return totals.calories === null
          ? []
          : { field, value: wholeNumber(totals.calories * f), label: 'kcal' };
    }
  });
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

  const fields = widgets.flatMap((widget) =>
    widget.kind === 'metric' ? [widget.metric as TotalsField] : [],
  );
  const entries = new Map(
    totalsEntries(
      totals,
      easeOut(progress(t, TIMING.count.at, TIMING.count.length)),
      countLabel,
      fields,
    ).map((entry) => [entry.field, entry]),
  );
  /** The widgets with something to show: a text, or a value the activities have. */
  const shown = widgets.flatMap(
    (widget): { widget: Widget; text: string; entry: TotalsEntry | null }[] => {
      if (widget.kind === 'text') {
        const text = widget.text ?? title;
        return text ? [{ widget, text, entry: null }] : [];
      }
      const entry = widget.kind === 'metric' ? entries.get(widget.metric as TotalsField) : null;
      return entry ? [{ widget, text: '', entry }] : [];
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
