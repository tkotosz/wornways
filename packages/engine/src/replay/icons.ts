// The icons a value can show in front of it, one for each kind of value: a stopwatch for
// times, a clock for clock times, a road for distances, a gauge for speeds, mountains for
// elevation, a heart, a bolt for power, a crank for cadence, a thermometer, a flame for
// calories, a flag for the activities and a calendar for days and dates.
//
// Each is drawn on a 24 by 24 grid as a few parts, a path filled or stroked (2 wide, with
// round ends), written as SVG path data that uses only absolute M, L, C and Z, so the page
// draws it as SVG and the engine traces the same path on its canvas (`drawIcon`).

import type { Metric } from './metrics.ts';
import type { Context2DLike } from './render.ts';

export type IconName =
  | 'stopwatch'
  | 'clock'
  | 'road'
  | 'gauge'
  | 'mountain'
  | 'heart'
  | 'bolt'
  | 'crank'
  | 'thermometer'
  | 'flame'
  | 'flag'
  | 'calendar';

/** A part of an icon: a path, filled, or stroked `width` wide (2 when left out). */
export type IconPart = { d: string; fill: boolean; width?: number };

const round = (n: number) => Number(n.toFixed(2));

/**
 * An arc of the circle around (`cx`, `cy`) of radius `r`, from angle `from` to `to` in degrees
 * (0 to the right, growing clockwise), as cubic curves of a quarter turn at most.
 */
function arc(cx: number, cy: number, r: number, from: number, to: number, move = true): string {
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] as const;
  };
  const steps = Math.ceil(Math.abs(to - from) / 90);
  const step = (to - from) / steps;
  // How far a control point stands off for a curve of `step` degrees.
  const k = (4 / 3) * Math.tan((step * Math.PI) / 720) * r;
  const [x0, y0] = point(from);
  let d = move ? `M${round(x0)} ${round(y0)}` : '';
  for (let i = 0; i < steps; i++) {
    const a = from + i * step;
    const b = a + step;
    const [ax, ay] = point(a);
    const [bx, by] = point(b);
    const ra = (a * Math.PI) / 180;
    const rb = (b * Math.PI) / 180;
    const c1 = [ax - k * Math.sin(ra), ay + k * Math.cos(ra)];
    const c2 = [bx + k * Math.sin(rb), by - k * Math.cos(rb)];
    d += ` C${round(c1[0]!)} ${round(c1[1]!)} ${round(c2[0]!)} ${round(c2[1]!)} ${round(bx)} ${round(by)}`;
  }
  return d;
}

/** A whole circle, as a closed path. */
const circle = (cx: number, cy: number, r: number) => `${arc(cx, cy, r, 0, 360)} Z`;

const stroke = (d: string, width?: number): IconPart => ({
  d,
  fill: false,
  ...(width ? { width } : {}),
});
const fill = (d: string): IconPart => ({ d, fill: true });

export const ICONS: Record<IconName, IconPart[]> = {
  stopwatch: [
    stroke(circle(12, 13.5, 7.5)),
    stroke('M9.5 2.5 L14.5 2.5 M12 2.5 L12 6'),
    stroke('M12 13.5 L12 9.5'),
    stroke('M18.2 6.8 L19.6 5.4'),
  ],
  clock: [stroke(circle(12, 12, 9)), stroke('M12 6.5 L12 12 L15.5 14')],
  // A road narrowing into the distance, with its dashed middle line.
  road: [
    stroke('M3 21.5 L9 2.5 M21 21.5 L15 2.5'),
    stroke('M12 19.5 L12 16.5 M12 12.5 L12 10 M12 6.5 L12 4.5', 1.8),
  ],
  gauge: [
    stroke(arc(12, 14, 9, 150, 390)),
    stroke('M12 14 L16.5 8.5', 2.4),
    fill(circle(12, 14, 1.8)),
  ],
  mountain: [fill('M1.5 20.5 L8.5 7 L12.5 14 L15.5 9.5 L22.5 20.5 Z')],
  heart: [
    stroke(
      'M12 20.5 C12 20.5 2.5 14.8 2.5 8.8 C2.5 5.9 4.8 3.8 7.6 3.8 C9.5 3.8 11.1 4.8 12 6.3 C12.9 4.8 14.5 3.8 16.4 3.8 C19.2 3.8 21.5 5.9 21.5 8.8 C21.5 14.8 12 20.5 12 20.5 Z',
    ),
    stroke('M6 11.5 L9 11.5 L10.6 8.5 L13 14.5 L14.6 11.5 L18 11.5', 1.8),
  ],
  bolt: [fill('M14 1.5 L4.5 13.5 L11 13.5 L10 22.5 L19.5 10 L13 10 Z')],
  // A crank arm with its pedal, inside an arrow going round.
  crank: [
    stroke(arc(12, 12, 9, -20, 245)),
    fill('M12.3 2.1 L7.6 0.6 L8.4 6 Z'),
    fill(circle(12, 12, 2.2)),
    stroke('M12 12 L15.2 16.4', 2.4),
    stroke('M13.4 17.4 L17.4 15.6', 2.4),
  ],
  thermometer: [
    stroke(`M9.8 14 L9.8 5 ${arc(12, 5, 2.2, 180, 360, false).trim()} L14.2 14`),
    stroke(arc(12, 17.3, 4, -55, 235)),
    fill(circle(12, 17.3, 2)),
    stroke('M12 16 L12 8.5', 2),
  ],
  flame: [
    fill(
      'M12 1.5 C12.5 5.5 18.8 8.5 18.8 14.5 C18.8 18.6 15.8 22 12 22 C8.2 22 5.2 18.9 5.2 15 C5.2 12 6.8 9.8 8.5 8.4 C8.5 11 9.6 12.8 11 13 C10.2 9 10.5 4.5 12 1.5 Z',
    ),
  ],
  flag: [stroke('M5 22 L5 2.5'), fill('M5 3 L19.5 3 L16.5 7.5 L19.5 12 L5 12 Z')],
  calendar: [
    stroke(
      'M5.5 5 L18.5 5 C19.6 5 20.5 5.9 20.5 7 L20.5 19 C20.5 20.1 19.6 21 18.5 21 L5.5 21 C4.4 21 3.5 20.1 3.5 19 L3.5 7 C3.5 5.9 4.4 5 5.5 5 Z',
    ),
    fill('M3.5 7 C3.5 5.9 4.4 5 5.5 5 L18.5 5 C19.6 5 20.5 5.9 20.5 7 L20.5 10 L3.5 10 Z'),
    stroke('M8 2.5 L8 6.5 M16 2.5 L16 6.5'),
  ],
};

/** The icon a value shows: one for each kind of value. */
export function iconOf(metric: Metric): IconName {
  if (metric === 'start' || metric === 'time-of-day') return 'clock';
  if (metric === 'time' || metric === 'moving' || metric.endsWith('-time')) return 'stopwatch';
  if (metric.endsWith('distance')) return 'road';
  if (metric.endsWith('speed')) return 'gauge';
  if (/climb|descent|elevation/.test(metric)) return 'mountain';
  if (metric.includes('heart-rate')) return 'heart';
  if (metric.includes('power')) return 'bolt';
  if (metric.includes('cadence')) return 'crank';
  if (metric.includes('temperature')) return 'thermometer';
  if (metric.includes('calories')) return 'flame';
  if (metric === 'count') return 'flag';
  return 'calendar';
}

/** An icon in front of a line of text: its size, and the gap after it, as parts of the text's. */
export const ICON_SIZE = 0.8;
export const ICON_GAP = 0.22;
/** The room an icon takes in front of text of `fontSize` pixels, its gap included. */
export const iconRoom = (fontSize: number) => fontSize * (ICON_SIZE + ICON_GAP);

/**
 * Draws `icon` in front of a line of text of `fontSize` pixels that starts at `x` with its
 * baseline at `baseline`, centered on the height of the figures. Gives where the text starts.
 */
export function drawIconBefore(
  ctx: Context2DLike,
  icon: IconName,
  x: number,
  baseline: number,
  fontSize: number,
): number {
  const size = fontSize * ICON_SIZE;
  drawIcon(ctx, icon, x, baseline - fontSize * 0.36 - size / 2, size);
  return x + iconRoom(fontSize);
}

/**
 * Draws `icon` `size` pixels wide and high with its top left at (`x`, `y`), in the context's
 * fill color for every part, filled or stroked as the part is.
 */
export function drawIcon(
  ctx: Context2DLike,
  icon: IconName,
  x: number,
  y: number,
  size: number,
): void {
  const k = size / 24;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ctx.fillStyle;
  for (const part of ICONS[icon]) {
    ctx.beginPath();
    tracePath(ctx, part.d, (px, py) => [x + px * k, y + py * k]);
    if (part.fill) ctx.fill();
    else {
      ctx.lineWidth = (part.width ?? 2) * k;
      ctx.stroke();
    }
  }
}

/** Traces SVG path data of absolute M, L, C and Z, each point placed by `at`. */
function tracePath(
  ctx: Context2DLike,
  d: string,
  at: (x: number, y: number) => readonly [number, number],
): void {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+/g) ?? [];
  let command = '';
  let i = 0;
  const next = () => Number(tokens[i++]);
  const point = () => at(next(), next());
  while (i < tokens.length) {
    if (/[MLCZ]/.test(tokens[i]!)) command = tokens[i++]!;
    if (command === 'M') {
      ctx.moveTo(...point());
      command = 'L';
    } else if (command === 'L') ctx.lineTo(...point());
    else if (command === 'C') {
      const [a, b, c] = [point(), point(), point()];
      ctx.bezierCurveTo(...a, ...b, ...c);
    } else if (command === 'Z') {
      ctx.closePath();
      command = '';
    } else throw new Error(`An icon's path takes M, L, C and Z, not "${command}"`);
  }
}
