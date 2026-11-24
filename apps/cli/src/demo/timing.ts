// Turning a route into the recorded points of a made-up activity: positions with times, as
// a GPS device would record them.

import { distanceM } from '@wornways/engine';
import type { LatLon } from './road-graph.ts';
import type { RouteHeights } from './terrain.ts';

/** A random number generator that gives the same numbers for the same seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A recorded point: where, seconds since the start, and its height in meters when known. */
export type Recorded = LatLon & { seconds: number; ele?: number };

/** How much faster than on the flat an activity moves at a gradient (0.05: a 5% climb). */
export type HillPace = (grade: number) => number;

/**
 * A ride: about half the speed up a 7% climb, nearly twice it down a steep descent, where
 * the brakes hold it at 1.8 times.
 */
export const RIDE_HILLS: HillPace = (grade) =>
  grade >= 0 ? 1 / (1 + 15 * grade) : Math.min(1.8, 1 - 12 * grade);

/** A run: about 60% of the speed up a 10% climb, a little faster downhill. */
export const RUN_HILLS: HillPace = (grade) =>
  grade >= 0 ? 1 / (1 + 7 * grade) : Math.min(1.15, 1 - 3 * grade);

export type Pace = {
  /** Average speed on the flat, in meters per second. */
  speed: number;
  /** The route's heights and how the gradient changes the speed; on the flat without them. */
  hills?: { heights: RouteHeights; pace: HillPace };
  /** Longest time between two recorded points, in seconds. */
  interval: number;
  /** A pause in the recording (a café stop), at this share of the route; none when absent. */
  stop?: { at: number; seconds: number };
};

/** How far a recorded position strays from the road, at most, in meters. */
const GPS_ERROR_M = 2.5;

/**
 * The points a device records along `route`: one at every bend of the road, and more on
 * straight stretches so that no two are more than `interval` seconds apart. The speed
 * drifts slowly around the average, slows on climbs and picks up on descents, positions
 * stray a little from the road, and a stop shows as a gap in time, as when a device
 * pauses itself. With the route's heights, each point records its height.
 */
export function recordRoute(route: LatLon[], pace: Pace, random: () => number): Recorded[] {
  const total = route.slice(1).reduce((sum, p, i) => sum + metres(route[i], p), 0);
  // The speed wanders with two slow waves of random phase, by up to 15% either way.
  const [phaseA, phaseB] = [random() * 2 * Math.PI, random() * 2 * Math.PI];
  const hills = pace.hills;
  const speedAt = (done: number) =>
    pace.speed *
    (hills ? hills.pace(hills.heights.grade(done)) : 1) *
    (1 +
      0.1 * Math.sin((done / 4000) * 2 * Math.PI + phaseA) +
      0.05 * Math.sin(done / 900 + phaseB));
  /** The height at this many meters along the route, rounded as a device records it. */
  const height = (done: number) =>
    hills ? { ele: Math.round(hills.heights.at(done) * 10) / 10 } : {};
  const jitter = (p: LatLon): LatLon => {
    const angle = random() * 2 * Math.PI;
    const m = random() * GPS_ERROR_M;
    const perLon = 111_320 * Math.cos((p.lat * Math.PI) / 180);
    return {
      lat: p.lat + (m * Math.sin(angle)) / 110_540,
      lon: p.lon + (m * Math.cos(angle)) / perLon,
    };
  };

  const points: Recorded[] = [{ ...route[0], seconds: 0, ...height(0) }];
  let seconds = 0;
  let done = 0;
  let stopped = !pace.stop;
  for (let i = 1; i < route.length; i++) {
    const length = metres(route[i - 1], route[i]);
    if (length === 0) continue;
    const steps = Math.max(1, Math.ceil(length / (speedAt(done) * pace.interval)));
    for (let s = 1; s <= steps; s++) {
      const share = s / steps;
      seconds += length / steps / speedAt(done + length * share);
      const at = {
        lat: route[i - 1].lat + (route[i].lat - route[i - 1].lat) * share,
        lon: route[i - 1].lon + (route[i].lon - route[i - 1].lon) * share,
      };
      points.push({
        ...jitter(at),
        seconds: Math.round(seconds),
        ...height(done + length * share),
      });
      // The stop starts at the first point past its share of the route.
      if (!stopped && done + length * share >= pace.stop!.at * total) {
        seconds += pace.stop!.seconds;
        stopped = true;
      }
    }
    done += length;
  }
  // Rounding can give two points the same second; a device records each second once.
  return points.filter((p, i) => i === 0 || p.seconds > points[i - 1].seconds);
}

const metres = (a: LatLon, b: LatLon) => distanceM(a.lat, a.lon, b.lat, b.lon);
