// The Wornways mark and name, drawn on a canvas: the end card animates them, and the
// renderer draws a small version by the map credit while the replay plays.

import type { Context2DLike } from './render.ts';

/**
 * The mark: a route forming a double W on a dark rounded tile, in a 512 × 512 frame. The
 * same drawing as the app's icon (apps/web/public/icons/mark.svg).
 */
export const MARK = {
  route: [
    [77, 197],
    [130, 302],
    [168, 222],
    [210, 302],
    [256, 190],
    [302, 302],
    [344, 222],
    [382, 302],
    [435, 197],
  ],
  routeWidth: 38,
  dotRadius: 28,
  dotCenterRadius: 11,
  tileRadius: 112,
  tile: '#0b111c',
  light: '#ffab1f',
  deep: '#ff5a1f',
} as const;

/** The length of the mark's route up to each of its points, in mark units. */
const ROUTE_DISTANCES = MARK.route.reduce<number[]>((distances, [x, y], i) => {
  if (i === 0) return [0];
  const [px, py] = MARK.route[i - 1];
  return [...distances, distances[i - 1] + Math.hypot(x - px, y - py)];
}, []);

/** The dark rounded tile, `size` pixels wide with its top left corner at (x, y). */
export function drawTile(ctx: Context2DLike, x: number, y: number, size: number): void {
  // Four corner arcs, joined by the lines between them.
  const r = MARK.tileRadius * (size / 512);
  ctx.fillStyle = MARK.tile;
  ctx.beginPath();
  ctx.arc(x + size - r, y + r, r, -Math.PI / 2, 0);
  ctx.arc(x + size - r, y + size - r, r, 0, Math.PI / 2);
  ctx.arc(x + r, y + size - r, r, Math.PI / 2, Math.PI);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  ctx.closePath();
  ctx.fill();
}

/**
 * The route from its start up to `fraction` of its length (0 to 1), in the gradient of
 * the whole route. Returns where it has got to.
 */
export function drawRoute(
  ctx: Context2DLike,
  at: (point: readonly [number, number]) => [number, number],
  scale: number,
  fraction: number,
): [number, number] {
  const [x0] = at([60, 0]);
  const [x1] = at([452, 0]);
  const gradient = ctx.createLinearGradient(x0, 0, x1, 0);
  gradient.addColorStop(0, MARK.light);
  gradient.addColorStop(1, MARK.deep);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = MARK.routeWidth * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const reach = fraction * ROUTE_DISTANCES[ROUTE_DISTANCES.length - 1];
  let head = at(MARK.route[0]);
  ctx.beginPath();
  ctx.moveTo(...head);
  for (let i = 1; i < MARK.route.length; i++) {
    const [ax, ay] = MARK.route[i - 1];
    const [bx, by] = MARK.route[i];
    const from = ROUTE_DISTANCES[i - 1];
    const along = Math.min(1, (reach - from) / (ROUTE_DISTANCES[i] - from));
    head = at([ax + (bx - ax) * along, ay + (by - ay) * along]);
    ctx.lineTo(...head);
    if (along < 1) break;
  }
  ctx.stroke();
  return head;
}

/** An end dot: a colored disc with a white center, `radius` pixels across. */
export function drawDot(
  ctx: Context2DLike,
  [x, y]: [number, number],
  radius: number,
  color: string,
): void {
  const center = radius * (MARK.dotCenterRadius / MARK.dotRadius);
  for (const [r, fill] of [
    [radius, color],
    [center, '#ffffff'],
  ] as const) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** "wornways", "worn" bold and "ways" light, in the mark's gradient, centered on x. */
export function drawWordmark(
  ctx: Context2DLike,
  x: number,
  baseline: number,
  size: number,
  fontFamily: string,
): void {
  const bold = `700 ${Math.round(size)}px ${fontFamily}`;
  const light = `300 ${Math.round(size)}px ${fontFamily}`;
  ctx.font = bold;
  const wornWidth = ctx.measureText('worn').width;
  ctx.font = light;
  const waysWidth = ctx.measureText('ways').width;
  const start = x - (wornWidth + waysWidth) / 2;

  const fill = ctx.createLinearGradient(start, 0, start + wornWidth + waysWidth, 0);
  fill.addColorStop(0, MARK.light);
  fill.addColorStop(1, MARK.deep);
  ctx.fillStyle = fill;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = bold;
  ctx.fillText('worn', start, baseline);
  ctx.font = light;
  ctx.fillText('ways', start + wornWidth, baseline);
}

/** The route's bounds in the mark's frame, with its end dots: x, y, width, height. */
const ROUTE_BOUNDS = [44, 164, 424, 162] as const;

/**
 * The small mark and name of the watermark: the route without its tile, then the name,
 * starting at `left` and sitting on `baseline`, a little faint.
 */
export function drawWatermark(
  ctx: Context2DLike,
  left: number,
  baseline: number,
  unit: number,
  fontFamily: string,
): void {
  const fontSize = 28 * unit;
  const routeHeight = 19 * unit;
  const gap = 9 * unit;

  ctx.globalAlpha = 0.8;
  ctx.font = `700 ${Math.round(fontSize)}px ${fontFamily}`;
  const wornWidth = ctx.measureText('worn').width;
  ctx.font = `300 ${Math.round(fontSize)}px ${fontFamily}`;
  const nameWidth = wornWidth + ctx.measureText('ways').width;

  // The route first, its middle level with the middle of the lowercase letters, then the name.
  const [bx, by, bw, bh] = ROUTE_BOUNDS;
  const scale = routeHeight / bh;
  drawWordmark(ctx, left + bw * scale + gap + nameWidth / 2, baseline, fontSize, fontFamily);
  const middle = baseline - fontSize * 0.27;
  const at = ([px, py]: readonly [number, number]): [number, number] => [
    left + (px - bx) * scale,
    middle + (py - by - bh / 2) * scale,
  ];
  drawRoute(ctx, at, scale, 1);
  drawDot(ctx, at(MARK.route[0]), MARK.dotRadius * scale, MARK.light);
  drawDot(ctx, at(MARK.route[MARK.route.length - 1]), MARK.dotRadius * scale, MARK.deep);
  ctx.globalAlpha = 1;
}
