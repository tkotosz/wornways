// The totals card after the replay of several activities: the finished map dims, the
// video's title comes in, and the totals count up: activities, kilometers, hours moving
// and meters climbed. It is added after the replay and before the end card, so the replay
// keeps the length it was given.

import { distanceM } from '../track/geo.ts';
import { STRIDE, type Track } from '../track/types.ts';
import { averagePace } from './pace.ts';
import type { CanvasLike, Context2DLike } from './render.ts';

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
const MOVING_SPEED = 0.5;

/** The number of frames the totals card adds at this frame rate. */
export const totalsCardFrames = (fps: number) => Math.round(TOTALS_CARD_S * fps);

/**
 * A value the totals card can show: the number of activities, kilometers, hours moving,
 * meters climbed, the average pace or speed while moving, or the days the activities span.
 * The names are the metrics card's for the same values.
 */
export type TotalsField = 'count' | 'distance' | 'time' | 'elevation' | 'pace' | 'date';
/** Every value of the totals card, in the order the settings list them. */
export const TOTALS_FIELDS: readonly TotalsField[] = [
  'count',
  'distance',
  'time',
  'elevation',
  'pace',
  'date',
];
/** The values the totals card shows unless told otherwise, in this order. */
export const AUTOMATIC_TOTALS: readonly TotalsField[] = ['count', 'distance', 'time', 'elevation'];

export type Totals = {
  activities: number;
  meters: number;
  /** Seconds moving: the stretches between points covered at walking speed or faster. */
  movingSeconds: number;
  /** Meters climbed; null when no activity recorded elevation. */
  climbed: number | null;
  /** Whether every activity is on foot, so pace is told in minutes per kilometer. */
  onFoot: boolean;
  /** The days the activities span, e.g. "18–22 Apr 2026". */
  dates: string;
};

/** The time an activity was moving: the time between points covered at `MOVING_SPEED` or faster. */
export function movingSeconds(track: Pick<Track, 'points'>): number {
  const p = track.points;
  const n = p.length / STRIDE;
  let seconds = 0;
  for (let i = 1; i < n; i++) {
    const o = i * STRIDE;
    const dt = p[o + 3] - p[o - STRIDE + 3];
    const meters = distanceM(p[o - STRIDE + 1], p[o - STRIDE], p[o + 1], p[o]);
    if (dt > 0 && meters / dt >= MOVING_SPEED) seconds += dt;
  }
  return seconds;
}

export type TotalsCardOptions = {
  width: number;
  height: number;
  fontFamily: string;
  /** The title over the totals; empty for none. */
  title: string;
  /** Singular and plural noun for the count, e.g. ["ride", "rides"]. */
  countLabel: [string, string];
  /** The values to show, in order; default `AUTOMATIC_TOTALS`. Elevation shows only when recorded. */
  fields?: readonly TotalsField[];
};

const smoothstep = (f: number) => f * f * (3 - 2 * f);
const easeOut = (f: number) => 1 - (1 - f) ** 3;
const progress = (t: number, at: number, length: number) =>
  Math.min(1, Math.max(0, (t - at) / length));
const wholeNumber = (n: number) => Math.round(n).toLocaleString('en-US');

/** A value of the totals card as shown: its text and the label under it. */
export type TotalsEntry = { field: TotalsField; value: string; label: string };

/**
 * The values of `fields` in their order, with their labels, the numbers shown at a share `f`
 * of their count-up; the pace and the dates do not count up. Elevation is left out when no
 * activity recorded it.
 */
export function totalsEntries(
  totals: Totals,
  f: number,
  countLabel: [string, string],
  fields: readonly TotalsField[] = AUTOMATIC_TOTALS,
): TotalsEntry[] {
  const hours = totals.movingSeconds / 3600;
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
      case 'time':
        return {
          field,
          value: hours < 10 ? (hours * f).toFixed(1) : wholeNumber(hours * f),
          label: 'hours moving',
        };
      case 'elevation':
        return totals.climbed === null
          ? []
          : { field, value: wholeNumber(totals.climbed * f), label: 'm climbed' };
      case 'pace': {
        const { value, unit } = averagePace(totals.onFoot, totals.movingSeconds, totals.meters);
        return { field, value, label: unit === '/km' ? 'min/km average' : 'km/h average' };
      }
      case 'date':
        return { field, value: totals.dates, label: 'dates' };
    }
  });
}

/**
 * Draws the totals card `t` seconds after the replay ended, over `last`, a copy of the
 * replay's last frame.
 */
export function drawTotalsCard(
  ctx: Context2DLike,
  last: CanvasLike,
  t: number,
  totals: Totals,
  { width: W, height: H, fontFamily, title, countLabel, fields }: TotalsCardOptions,
): void {
  const unit = Math.min(W, H) / 1080;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(last, 0, 0);
  ctx.globalAlpha = DIM * smoothstep(progress(t, TIMING.dim.at, TIMING.dim.length));
  ctx.fillStyle = '#050608';
  ctx.fillRect(0, 0, W, H);

  const values = totalsEntries(
    totals,
    easeOut(progress(t, TIMING.count.at, TIMING.count.length)),
    countLabel,
    fields,
  );
  // Rows of values: every number in one row on a wide frame, two to a row otherwise, a last
  // odd one centered. The dates are too long to share a row, so they get one of their own
  // where they sit in the order, in smaller type.
  const numbers = values.filter((entry) => entry.field !== 'date').length;
  const perRow = W > H * 1.3 ? Math.max(1, numbers) : 2;
  const rows: { entries: { entry: TotalsEntry; order: number }[]; dates: boolean }[] = [];
  values.forEach((entry, order) => {
    const last = rows.at(-1);
    if (entry.field === 'date') rows.push({ entries: [{ entry, order }], dates: true });
    else if (last && !last.dates && last.entries.length < perRow)
      last.entries.push({ entry, order });
    else rows.push({ entries: [{ entry, order }], dates: false });
  });
  const valueSize = 96 * unit;
  const datesSize = 60 * unit;
  const labelSize = 30 * unit;
  const gap = 70 * unit;
  const rowHeight = (dates: boolean) => (dates ? datesSize : valueSize) + labelSize + gap;
  const titleSize = 52 * unit;
  const titleRoom = title ? titleSize + 90 * unit : 0;
  const blockHeight = titleRoom + rows.reduce((sum, row) => sum + rowHeight(row.dates), 0) - gap;
  const top = (H - blockHeight) / 2;

  // Darker still behind the title and the values, fading out above and below them, so
  // place names on the map do not show through the numbers.
  const room = 120 * unit;
  const band = ctx.createLinearGradient(0, top - room, 0, top + blockHeight + room);
  band.addColorStop(0, 'rgba(5, 6, 8, 0)');
  band.addColorStop(0.25, 'rgba(5, 6, 8, 0.75)');
  band.addColorStop(0.75, 'rgba(5, 6, 8, 0.75)');
  band.addColorStop(1, 'rgba(5, 6, 8, 0)');
  ctx.globalAlpha = smoothstep(progress(t, TIMING.dim.at, TIMING.dim.length));
  ctx.fillStyle = band;
  ctx.fillRect(0, top - room, W, blockHeight + 2 * room);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (title) {
    const shown = smoothstep(progress(t, TIMING.title.at, TIMING.title.length));
    ctx.globalAlpha = shown;
    ctx.font = `600 ${Math.round(titleSize)}px ${fontFamily}`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.fillText(title, W / 2, top + titleSize, W * 0.88);
    // A short orange rule under the title.
    ctx.fillStyle = '#ff8a2a';
    const rule = 64 * unit * shown;
    ctx.fillRect(W / 2 - rule / 2, top + titleSize + 34 * unit, rule, 5 * unit);
  }

  /** Sets the font at `size`, or smaller when `text` would be wider than `width`. */
  const fitFont = (text: string, weight: number, size: number, width: number) => {
    ctx.font = `${weight} ${Math.round(size)}px ${fontFamily}`;
    const measured = ctx.measureText(text).width;
    if (measured > width)
      ctx.font = `${weight} ${Math.floor((size * width) / measured)}px ${fontFamily}`;
  };

  const columnWidth = Math.min(W * 0.4, (W * 0.86) / perRow);
  let rowTop = top + titleRoom;
  for (const row of rows) {
    const size = row.dates ? datesSize : valueSize;
    const width = row.dates ? W * 0.86 : columnWidth * 0.92;
    row.entries.forEach(({ entry, order }, column) => {
      const x = W / 2 + (column - (row.entries.length - 1) / 2) * columnWidth;
      const shown = smoothstep(
        progress(t, TIMING.values.at + order * TIMING.values.stagger, TIMING.values.length),
      );
      const y = rowTop + size + (1 - shown) * 24 * unit;
      ctx.globalAlpha = shown;
      fitFont(entry.value, 700, size, width);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
      ctx.fillText(entry.value, x, y);
      fitFont(entry.label, 500, labelSize, width);
      ctx.fillStyle = 'rgba(255, 176, 102, 0.9)';
      ctx.fillText(entry.label, x, y + labelSize + 22 * unit);
    });
    rowTop += rowHeight(row.dates);
  }
  ctx.globalAlpha = 1;
}
