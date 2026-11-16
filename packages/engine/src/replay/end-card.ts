// The card at the end of a video: the finished map fades to black and the Wornways mark
// draws itself, like a replay in small: the tile appears with the start dot, the route runs
// through the double W with a glowing head, the end dot lands, and the name fades in under
// it. The card is added after the replay, so the replay keeps the length it was given.

import { MARK, drawDot, drawRoute, drawTile, drawWordmark } from './mark.ts';
import type { CanvasLike, Context2DLike } from './render.ts';

/** How long the end card plays, in seconds: its parts, then a short hold on the card. */
export const END_CARD_S = 3.2;

/** When each part starts and how long it takes, in seconds from the end of the replay. */
const TIMING = {
  /** The map fades to black as soon as the replay ends, slowly. */
  black: { at: 0, length: 1.2 },
  /** The tile and the start dot fade in. */
  tile: { at: 0.8, length: 0.4 },
  /** The route runs from the start dot to the end dot. */
  route: { at: 1.1, length: 1.2 },
  /** The end dot grows in as the route reaches it. */
  endDot: { at: 2.25, length: 0.2 },
  /** The route's glowing head fades once it has arrived. */
  headFade: { at: 2.3, length: 0.3 },
  /** The name fades in. */
  name: { at: 2.3, length: 0.5 },
} as const;

const BLACK = '#050608';

export type EndCardOptions = { width: number; height: number; fontFamily: string };

/** The number of frames the end card adds at this frame rate. */
export const endCardFrames = (fps: number) => Math.round(END_CARD_S * fps);

const smoothstep = (f: number) => f * f * (3 - 2 * f);

/** How far a part has got at time t, from 0 (not started) to 1 (done), eased. */
function progress(t: number, { at, length }: { at: number; length: number }): number {
  return smoothstep(Math.min(1, Math.max(0, (t - at) / length)));
}

/**
 * Draws the end card `t` seconds after the replay ended, over `last`, a copy of the replay's
 * last frame.
 */
export function drawEndCard(
  ctx: Context2DLike,
  last: CanvasLike,
  t: number,
  { width: W, height: H, fontFamily }: EndCardOptions,
): void {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const black = progress(t, TIMING.black);
  if (black < 1) ctx.drawImage(last, 0, 0);
  if (black === 0) return;
  ctx.globalAlpha = black;
  ctx.fillStyle = BLACK;
  ctx.fillRect(0, 0, W, H);

  // The tile above the name, the two together in the middle of the frame.
  const unit = Math.min(W, H) / 1080;
  const size = 230 * unit;
  const fontSize = 84 * unit;
  const gap = 46 * unit;
  const top = (H - (size + gap + fontSize * 0.75)) / 2;
  const left = (W - size) / 2;
  const scale = size / 512;
  const at = ([px, py]: readonly [number, number]): [number, number] => [
    left + px * scale,
    top + py * scale,
  ];

  const tile = progress(t, TIMING.tile);
  if (tile > 0) {
    ctx.globalAlpha = tile;
    drawGlow(ctx, W / 2, top + size / 2, size * 1.3);
    drawTile(ctx, left, top, size);
  }

  // The route, then the start dot on top of it, as in the icon, then the route's head.
  const route = progress(t, TIMING.route);
  let head: [number, number] | null = null;
  if (route > 0) {
    ctx.globalAlpha = 1;
    head = drawRoute(ctx, at, scale, route);
  }
  if (tile > 0) {
    ctx.globalAlpha = tile;
    drawDot(ctx, at(MARK.route[0]), MARK.dotRadius * scale, MARK.light);
  }
  const glow = 1 - progress(t, TIMING.headFade);
  if (head && glow > 0) {
    ctx.globalAlpha = 1;
    drawHead(ctx, head, 70 * scale, glow);
  }

  const endDot = progress(t, TIMING.endDot);
  if (endDot > 0) {
    ctx.globalAlpha = 1;
    drawDot(ctx, at(MARK.route[MARK.route.length - 1]), MARK.dotRadius * scale * endDot, MARK.deep);
  }

  const name = progress(t, TIMING.name);
  if (name > 0) {
    ctx.globalAlpha = name;
    drawWordmark(ctx, W / 2, top + size + gap + fontSize * 0.75, fontSize, fontFamily);
  }
  ctx.globalAlpha = 1;
}

/** A soft orange light behind the tile. */
function drawGlow(ctx: Context2DLike, x: number, y: number, radius: number): void {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, 'rgba(255, 120, 40, 0.22)');
  glow.addColorStop(1, 'rgba(255, 120, 40, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** The glowing head of the route as it runs, like the heads of the activities in the replay. */
function drawHead(
  ctx: Context2DLike,
  [x, y]: [number, number],
  radius: number,
  strength: number,
): void {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, `rgba(255, 244, 230, ${(0.95 * strength).toFixed(3)})`);
  glow.addColorStop(0.22, `rgba(255, 190, 130, ${(0.5 * strength).toFixed(3)})`);
  glow.addColorStop(1, 'rgba(255, 120, 40, 0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}
