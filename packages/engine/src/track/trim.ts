import { distanceM, mercatorX, mercatorY, metresPerDegree } from './geo.ts';
import { STRIDE, type Track } from './types.ts';

type Zone = { x: number; y: number; scaleX: number; scaleY: number };
type Interval = [from: number, to: number];

function zoneAt(points: Float64Array, offset: number): Zone {
  const lat = points[offset + 1];
  const { perLat, perLon } = metresPerDegree(lat);
  return {
    x: mercatorX(points[offset]),
    y: mercatorY(lat),
    scaleX: 360 * perLon,
    scaleY: 360 * Math.cos((lat * Math.PI) / 180) * perLat,
  };
}

/** The part of a map segment inside the endpoint's circle, in local metres. */
function inside(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  zone: Zone,
  radius: number,
): Interval | null {
  const x = (x0 - zone.x) * zone.scaleX;
  const y = (y0 - zone.y) * zone.scaleY;
  const dx = (x1 - x0) * zone.scaleX;
  const dy = (y1 - y0) * zone.scaleY;
  const length = Math.hypot(dx, dy);
  if (!length) return Math.hypot(x, y) <= radius ? [0, 1] : null;
  const ux = dx / length;
  const uy = dy / length;
  const across = x * uy - y * ux;
  if (Math.abs(across) >= radius) return null;
  const along = -(x * ux + y * uy);
  const half = Math.sqrt(radius ** 2 - across ** 2);
  const from = Math.max(0, (along - half) / length);
  const to = Math.min(1, (along + half) / length);
  return to > from ? [from, to] : null;
}

function pointAt(points: Float64Array, index: number): Float64Array {
  const offset = Math.floor(index) * STRIDE;
  const fraction = index % 1;
  const point = points.slice(offset, offset + STRIDE);
  if (fraction === 0) return point;
  for (let i = 0; i < STRIDE; i++) point[i] += fraction * (points[offset + STRIDE + i] - point[i]);
  // Match the straight segment drawn on the Mercator map, including at the trim boundary.
  const y = mercatorY(points[offset + 1]);
  const cut = y + fraction * (mercatorY(points[offset + STRIDE + 1]) - y);
  point[1] = (Math.atan(Math.sinh((0.5 - cut) * 2 * Math.PI)) * 180) / Math.PI;
  return point;
}

/** Keep the longest continuous part of a cleaned route outside both endpoint circles. */
export function trimEndpoints(track: Track, radius: number): Track | null {
  const p = track.points;
  const last = p.length / STRIDE - 1;
  const zones = [zoneAt(p, 0), zoneAt(p, last * STRIDE)];
  // Track a visible section with fractional point indices, so each cut can land
  // between two samples without joining separate sections.
  let start = 0;
  let length = 0;
  let longest = 0;
  let best: Interval = [0, 0];
  const finish = (end: number) => {
    if (length > longest) {
      longest = length;
      best = [start, end];
    }
    length = 0;
  };

  for (let i = 0; i < last; i++) {
    const a = i * STRIDE;
    const b = a + STRIDE;
    const x0 = mercatorX(p[a]);
    const y0 = mercatorY(p[a + 1]);
    const x1 = mercatorX(p[b]);
    const y1 = mercatorY(p[b + 1]);
    if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
    const distance = distanceM(p[a + 1], p[a], p[b + 1], p[b]);
    const hidden = zones
      .map((zone) => inside(x0, y0, x1, y1, zone, radius))
      .filter((interval) => interval !== null)
      .sort((a, b) => a[0] - b[0]);
    let shown = 0;
    for (const [from, to] of hidden) {
      if (to <= shown) continue;
      length += Math.max(0, from - shown) * distance;
      finish(i + Math.max(shown, from));
      start = i + to;
      shown = to;
    }
    length += (1 - shown) * distance;
  }
  finish(last);
  if (longest === 0) return null;

  const [from, to] = best;
  const first = Math.floor(from) + 1;
  const past = Math.ceil(to);
  const points = new Float64Array((past - first + 2) * STRIDE);
  points.set(pointAt(p, from));
  points.set(p.subarray(first * STRIDE, past * STRIDE), STRIDE);
  points.set(pointAt(p, to), points.length - STRIDE);
  const elapsed = points[3];
  for (let i = 3; i < points.length; i += STRIDE) points[i] -= elapsed;
  // Retain the activity's original grouping date while the visible clock starts at zero.
  return { ...track, points };
}
