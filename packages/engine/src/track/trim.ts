import { distanceM, longitudeDelta, mercatorY, metresPerDegree } from './geo.ts';
import { trackEnd, trackStart, type LatLon } from './places.ts';
import { STRIDE, type Track } from './types.ts';

type Zone = { lon: number; y: number; scaleX: number; scaleY: number; radius: number };
type Interval = [from: number, to: number];

/**
 * How much larger the hidden circle is than the radius asked for: its centre is at most
 * half a grid cell's diagonal (radius / sqrt 2) from the endpoint, with a little to spare
 * for the flat-earth distances.
 */
const GROWTH = 1 + 1.01 * Math.SQRT1_2;

/**
 * The circle hidden around an endpoint. A circle centred on the endpoint itself would give
 * it away: every visible route starts on the circle's edge, and a few routes from the same
 * place outline the circle and so its centre. Instead the circle is centred on the nearest
 * point of a fixed grid, `radius` meters apart, which endpoints close together share. That
 * point tells only that the endpoint is within half a cell of it. The circle is grown so
 * that it still hides at least `radius` around the endpoint.
 */
export function hiddenCircle(point: LatLon, radius: number): { centre: LatLon; radius: number } {
  const latStep = radius / metresPerDegree(0).perLat;
  const lat = Math.round(point.lat / latStep) * latStep;
  // Each grid row has its own spacing along it, so every point in the row snaps alike.
  const lonStep = radius / Math.max(metresPerDegree(lat).perLon, 1e-6);
  const lon = longitudeDelta(0, Math.round(point.lon / lonStep) * lonStep);
  return { centre: { lat, lon }, radius: radius * GROWTH };
}

function zoneAt(point: LatLon, radius: number): Zone {
  const { centre, radius: hidden } = hiddenCircle(point, radius);
  const { perLat, perLon } = metresPerDegree(centre.lat);
  return {
    lon: centre.lon,
    y: mercatorY(centre.lat),
    scaleX: perLon,
    scaleY: 360 * Math.cos((centre.lat * Math.PI) / 180) * perLat,
    radius: hidden,
  };
}

/** The part of a map segment inside a hidden circle, in local metres. */
function inside(lon0: number, y0: number, lon1: number, y1: number, zone: Zone): Interval | null {
  const { radius } = zone;
  const x = longitudeDelta(zone.lon, lon0) * zone.scaleX;
  const y = (y0 - zone.y) * zone.scaleY;
  const dx = longitudeDelta(lon0, lon1) * zone.scaleX;
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
  for (let i = 2; i < STRIDE; i++) point[i] += fraction * (points[offset + STRIDE + i] - point[i]);
  point[0] = longitudeDelta(
    0,
    point[0] + fraction * longitudeDelta(point[0], points[offset + STRIDE]),
  );
  // Match the straight segment drawn on the Mercator map, including at the trim boundary.
  const y = mercatorY(points[offset + 1]);
  const cut = y + fraction * (mercatorY(points[offset + STRIDE + 1]) - y);
  point[1] = (Math.atan(Math.sinh((0.5 - cut) * 2 * Math.PI)) * 180) / Math.PI;
  return point;
}

/**
 * Keep the longest continuous part of a cleaned route outside the circles hidden around its
 * start and finish (see `hiddenCircle`).
 */
export function trimEndpoints(track: Track, radius: number, original: Track = track): Track | null {
  const p = track.points;
  const last = p.length / STRIDE - 1;
  const ends = [trackStart(track), trackEnd(track)];
  // Cleaning can drop an endpoint that the surviving route visits again later.
  for (const point of [trackStart(original), trackEnd(original)])
    if (!ends.some(({ lat, lon }) => lat === point.lat && lon === point.lon)) ends.push(point);
  const zones = ends.map((point) => zoneAt(point, radius));
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
    const y0 = mercatorY(p[a + 1]);
    const y1 = mercatorY(p[b + 1]);
    if (![p[a], y0, p[b], y1].every(Number.isFinite)) return null;
    const distance = distanceM(p[a + 1], p[a], p[b + 1], p[b]);
    const hidden = zones
      .map((zone) => inside(p[a], y0, p[b], y1, zone))
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
