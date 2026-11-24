// The totals card after the replay of several activities: the finished map dims, the
// video's title comes in, and the totals count up: activities, kilometers, hours moving
// and meters climbed. It is added after the replay and before the end card, so the replay
// keeps the length it was given.

import { distanceM } from '../track/geo.ts';
import { STRIDE, type Track } from '../track/types.ts';
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
 * A value the totals card can show: the number of activities, kilometers, hours moving or
 * meters climbed. The names are the metrics card's for the same values.
 */
export type TotalsField = 'count' | 'distance' | 'time' | 'elevation';
/** Every value of the totals card, in the order it shows them unless told otherwise. */
export const TOTALS_FIELDS: readonly TotalsField[] = ['count', 'distance', 'time', 'elevation'];

export type Totals = {
  activities: number;
  meters: number;
  /** Seconds moving: the stretches between points covered at walking speed or faster. */
  movingSeconds: number;
  /** Meters climbed; null when no activity recorded elevation. */
  climbed: number | null;
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
  /** The values to show, in order; default every one. Elevation shows only when recorded. */
  fields?: readonly TotalsField[];
};

const smoothstep = (f: number) => f * f * (3 - 2 * f);
const easeOut = (f: number) => 1 - (1 - f) ** 3;
const progress = (t: number, at: number, length: number) =>
  Math.min(1, Math.max(0, (t - at) / length));
const wholeNumber = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * The values of `fields` in their order, with their labels, each shown at a share `f` of
 * its count-up. Elevation is left out when no activity recorded it.
 */
export function totalsEntries(
  totals: Totals,
  f: number,
  countLabel: [string, string],
  fields: readonly TotalsField[] = TOTALS_FIELDS,
): { field: TotalsField; value: string; label: string }[] {
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
  // A row of all values on a wide frame; two columns otherwise, a last odd one centered.
  const columns = W > H * 1.3 ? Math.max(1, values.length) : 2;
  const rows = Math.ceil(values.length / columns);
  const valueSize = 96 * unit;
  const labelSize = 30 * unit;
  const rowStep = valueSize + labelSize + 70 * unit;
  const titleSize = 52 * unit;
  const titleRoom = title ? titleSize + 90 * unit : 0;
  const blockHeight = titleRoom + rows * rowStep - 70 * unit;
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

  const columnWidth = Math.min(W * 0.4, (W * 0.86) / columns);
  values.forEach((entry, i) => {
    const row = Math.floor(i / columns);
    const inRow = Math.min(columns, values.length - row * columns);
    const column = i % columns;
    const x = W / 2 + (column - (inRow - 1) / 2) * columnWidth;
    const shown = smoothstep(
      progress(t, TIMING.values.at + i * TIMING.values.stagger, TIMING.values.length),
    );
    const rise = (1 - shown) * 24 * unit;
    const y = top + titleRoom + row * rowStep + valueSize + rise;
    ctx.globalAlpha = shown;
    ctx.font = `700 ${Math.round(valueSize)}px ${fontFamily}`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.fillText(entry.value, x, y, columnWidth * 0.92);
    ctx.font = `500 ${Math.round(labelSize)}px ${fontFamily}`;
    ctx.fillStyle = 'rgba(255, 176, 102, 0.9)';
    ctx.fillText(entry.label, x, y + labelSize + 22 * unit, columnWidth * 0.92);
  });
  ctx.globalAlpha = 1;
}
