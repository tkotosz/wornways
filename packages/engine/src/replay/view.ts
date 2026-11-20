import { mercatorX, mercatorY } from '../track/geo.ts';
import { STRIDE, type Track } from '../track/types.ts';

/** Maps normalised Web Mercator (world = 0..1) to frame pixels: px = world * scale + off. */
export type View = {
  width: number;
  height: number;
  scale: number;
  offX: number;
  offY: number;
  /** Shift western longitudes to the next world copy for routes near the date line. */
  wrapLongitude?: boolean;
};

const wrappedX = (x: number) => (x < 0.5 ? x + 1 : x);

export function viewX(lon: number, view: View): number {
  const x = mercatorX(lon);
  return (view.wrapLongitude ? wrappedX(x) : x) * view.scale + view.offX;
}

/** Part of the frame the tracks are fitted into; the rest is left for the title and counters. */
const TRACK_AREA = { x: 0.06, y: 0.1, w: 0.88, h: 0.7 };

/** The track area in pixels for a frame of the given size. */
export function trackArea(
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: width * TRACK_AREA.x,
    y: height * TRACK_AREA.y,
    w: width * TRACK_AREA.w,
    h: height * TRACK_AREA.h,
  };
}

/** Fits every point of every track into the frame's track area. */
export function fitView(tracks: Pick<Track, 'points'>[], width: number, height: number): View {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let wrappedMin = Infinity;
  let wrappedMax = -Infinity;
  for (const track of tracks) {
    const p = track.points;
    for (let i = 0; i < p.length; i += STRIDE) {
      const x = mercatorX(p[i]);
      const y = mercatorY(p[i + 1]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const wrapped = wrappedX(x);
      if (wrapped < wrappedMin) wrappedMin = wrapped;
      if (wrapped > wrappedMax) wrappedMax = wrapped;
    }
  }
  if (minX > maxX) throw new Error('No points to fit');
  const span = maxX - minX;
  const wrapLongitude = span > 0.5 && wrappedMax - wrappedMin < span;
  if (wrapLongitude) {
    minX = wrappedMin;
    maxX = wrappedMax;
  }
  const area = trackArea(width, height);
  const scale = Math.min(
    area.w / Math.max(maxX - minX, 1e-12),
    area.h / Math.max(maxY - minY, 1e-12),
  );
  return {
    width,
    height,
    scale,
    offX: area.x + (area.w - (maxX - minX) * scale) / 2 - minX * scale,
    offY: area.y + (area.h - (maxY - minY) * scale) / 2 - minY * scale,
    wrapLongitude,
  };
}
