// Ride with GPS trips turned into what the app works with: sport names, list entries and
// tracks. Kept apart from the requests (ridewithgps.ts) so it can be tested on its own.

import { defaultActivityName, STRIDE, type LatLon, type Track } from '@wornways/engine';
import type { TripRow } from '../../../../functions/api/ridewithgps/trips.ts';
import type { ActivitySummary } from '../messages.ts';
import type { RemoteActivity } from './remote-activities.ts';

/** Ride with GPS's activity types, named the way the rest of the app names sports. */
const SPORTS: Record<string, string> = {
  'cycling:generic': 'ride',
  'cycling:road': 'ride',
  'cycling:commute': 'ride',
  'cycling:recumbent': 'ride',
  'cycling:gravel': 'gravel-ride',
  'cycling:cyclocross': 'gravel-ride',
  'cycling:mountain': 'mountain-bike-ride',
  'cycling:hand_cycling': 'handcycle',
  'cycling:indoor': 'virtual-ride',
  'cycling:virtual': 'virtual-ride',
  'e_biking:generic': 'e-bike-ride',
  'e_biking:road': 'e-bike-ride',
  'e_biking:mountain': 'e-mountain-bike-ride',
  'running:generic': 'run',
  'running:road': 'run',
  'running:trail': 'trail-run',
  'running:indoor': 'virtual-run',
  'walking:generic': 'walk',
  'walking:speed': 'walk',
  'walking:hiking': 'hike',
  'walking:indoor': 'walk',
  'swimming:generic': 'swim',
  'swimming:lap': 'swim',
  'swimming:open_water': 'swim',
  'snow:generic': 'alpine-ski',
  'snow:alpine_skiing': 'alpine-ski',
  'snow:cross_country_skiing': 'nordic-ski',
  'snow:snowboarding': 'snowboard',
  'snow:snowshoeing': 'snowshoe',
  'driving:generic': 'drive',
  'motorcycling:generic': 'motorcycle',
  'motorcycling:atv': 'motorcycle',
  'motorcycling:motocross': 'motorcycle',
};

/** The sport of a trip. Cycling types not listed above are rides, other types workouts. */
export function tripSport(activityType: string | null): string {
  if (!activityType) return 'unknown';
  return SPORTS[activityType] ?? (activityType.startsWith('cycling:') ? 'ride' : 'workout');
}

/** The app's id of a trip; the trip's own id follows the prefix. */
export const activityId = (tripId: number | string) => `rwgps-${tripId}`;
export const tripId = (activityId: string) => activityId.replace(/^rwgps-/, '');

function position(lat: unknown, lon: unknown): LatLon | undefined {
  if (typeof lat !== 'number' || typeof lon !== 'number') return;
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)
    return { lat, lon };
}

/**
 * A trip in the list; null for a trip without a route to replay, such as an indoor one. Its
 * version is when it was last changed, so an edited trip's track is fetched again.
 */
export function listedTrip(row: TripRow): RemoteActivity | null {
  const startTime = row.departed_at ? Date.parse(row.departed_at) : NaN;
  if (row.stationary || !Number.isFinite(startTime)) return null;
  const sport = tripSport(row.activity_type);
  return {
    summary: {
      id: activityId(row.id),
      name: row.name?.trim() || defaultActivityName(sport, startTime),
      sport,
      startTime,
      distanceM: Number.isFinite(row.distance) ? row.distance! : 0,
    },
    start: position(row.first_lat, row.first_lng),
    end: position(row.last_lat, row.last_lng),
    version: row.updated_at ?? '',
  };
}

export type TripPoint = { x?: unknown; y?: unknown; e?: unknown; t?: unknown };

/** A trip's track from its points; null when it has fewer than two timed positions. */
export function trackFromTrip(summary: ActivitySummary, points: TripPoint[]): Track | null {
  const packed = new Float64Array(points.length * STRIDE);
  let size = 0;
  let first = NaN;
  for (const point of points) {
    const at = position(point.y, point.x);
    const time = point.t;
    if (!at || typeof time !== 'number' || !Number.isFinite(time)) continue;
    // Points out of time order (a merged recording, say) are left out.
    if (size && time < packed[size - 1]!) continue;
    if (!size) first = time;
    packed[size++] = at.lon;
    packed[size++] = at.lat;
    packed[size++] = typeof point.e === 'number' && Number.isFinite(point.e) ? point.e : NaN;
    packed[size++] = time;
  }
  if (size < 2 * STRIDE) return null;
  for (let i = 3; i < size; i += STRIDE) packed[i] = packed[i]! - first;
  return {
    id: summary.id,
    name: summary.name,
    sport: summary.sport,
    startTime: first * 1000,
    points: packed.slice(0, size),
  };
}
