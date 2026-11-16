// Where activities start and end: the places the "starts near" and "ends near" filters
// compare with, and the places many activities start or end at, to suggest for them.

import { distanceM } from './geo.ts';
import { STRIDE, type Track } from './types.ts';

export type LatLon = { lat: number; lon: number };

/** A track's start or its end. */
export type TrackEnd = 'start' | 'end';

export function trackStart(track: Pick<Track, 'points'>): LatLon {
  return { lat: track.points[1], lon: track.points[0] };
}

export function trackEnd(track: Pick<Track, 'points'>): LatLon {
  const p = track.points;
  return { lat: p[p.length - STRIDE + 1], lon: p[p.length - STRIDE] };
}

const pointAt = (track: Pick<Track, 'points'>, end: TrackEnd) =>
  end === 'start' ? trackStart(track) : trackEnd(track);

/** How far the track's start or end is from the place, in meters. */
export function distanceFrom(track: Pick<Track, 'points'>, end: TrackEnd, place: LatLon): number {
  const p = pointAt(track, end);
  return distanceM(p.lat, p.lon, place.lat, place.lon);
}

/**
 * The densest cluster of the points: the point with the most others within `radiusM`,
 * returned as the mean of that cluster.
 */
function densest(points: LatLon[], radiusM: number): { center: LatLon; count: number } {
  let best = 0;
  let bestCount = 0;
  for (let i = 0; i < points.length; i++) {
    let count = 0;
    for (const p of points)
      if (distanceM(points[i].lat, points[i].lon, p.lat, p.lon) <= radiusM) count++;
    if (count > bestCount) {
      bestCount = count;
      best = i;
    }
  }
  let lat = 0;
  let lon = 0;
  for (const p of points) {
    if (distanceM(points[best].lat, points[best].lon, p.lat, p.lon) <= radiusM) {
      lat += p.lat;
      lon += p.lon;
    }
  }
  return { center: { lat: lat / bestCount, lon: lon / bestCount }, count: bestCount };
}

/** A place many activities start or end at, as `frequentPlaces` finds it. */
export type FrequentPlace = LatLon & {
  /** How many activities start (or end) within the radius. */
  count: number;
  /** Start time of the first and the last of them, epoch milliseconds. */
  first: number;
  last: number;
};

/**
 * The places most activities start (or end) at, the busiest first: the densest cluster of
 * starts within `radiusM`, then the densest of the starts left, and so on, until `limit`
 * places or fewer than `minCount` starts in a cluster. Someone who moved gets each home as
 * a place.
 */
export function frequentPlaces(
  tracks: Pick<Track, 'points' | 'startTime'>[],
  end: TrackEnd,
  radiusM: number,
  limit: number,
  minCount = 2,
): FrequentPlace[] {
  let left = tracks.map((t) => ({ ...pointAt(t, end), time: t.startTime }));
  const places: FrequentPlace[] = [];
  while (places.length < limit && left.length > 0) {
    const { center } = densest(left, radiusM);
    const near = (p: LatLon) => distanceM(center.lat, center.lon, p.lat, p.lon) <= radiusM;
    const members = left.filter(near);
    if (members.length < minCount) break;
    const times = members.map((m) => m.time);
    places.push({
      ...center,
      count: members.length,
      first: Math.min(...times),
      last: Math.max(...times),
    });
    left = left.filter((p) => !near(p));
  }
  return places;
}
