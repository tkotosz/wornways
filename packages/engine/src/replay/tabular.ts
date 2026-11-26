// Tabular figures: digits drawn in cells as wide as the font's widest digit, as counters,
// clocks and scoreboards set them, so a number keeps its width while it counts and does not
// wobble. Canvas text has no switch for the font's own tabular figures, so each digit is
// placed in its cell; everything else is drawn as it is.

import type { Context2DLike } from './render.ts';

/** The cell a digit takes in each font: as wide as its widest digit. */
const cells = new Map<string, number>();

/** The width of a digit's cell in the context's font. */
function cellOf(ctx: Context2DLike): number {
  let cell = cells.get(ctx.font);
  if (cell === undefined) {
    cell = Math.max(...[...'0123456789'].map((digit) => ctx.measureText(digit).width));
    cells.set(ctx.font, cell);
  }
  return cell;
}

/** The text as runs: digits one by one, and what is between them as it is. */
const runsOf = (text: string) => text.match(/[0-9]|[^0-9]+/g) ?? [];

/** How wide `text` is with tabular figures, in the context's font. */
export function tabularWidth(ctx: Context2DLike, text: string): number {
  const cell = cellOf(ctx);
  return runsOf(text).reduce(
    (width, run) => width + (/^[0-9]$/.test(run) ? cell : ctx.measureText(run).width),
    0,
  );
}

/**
 * Draws `text` with tabular figures from `x` rightwards, its baseline at `y`, each digit in
 * the middle of its cell. Gives where it ends.
 */
export function fillTabular(ctx: Context2DLike, text: string, x: number, y: number): number {
  const cell = cellOf(ctx);
  const align = ctx.textAlign;
  let at = x;
  for (const run of runsOf(text)) {
    if (/^[0-9]$/.test(run)) {
      ctx.textAlign = 'center';
      ctx.fillText(run, at + cell / 2, y);
      at += cell;
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(run, at, y);
      at += ctx.measureText(run).width;
    }
  }
  ctx.textAlign = align;
  return at;
}
