// Turning a route into the recorded points of a made-up activity: positions with times, as
// a GPS device would record them.

import { distanceM } from '@wornways/engine';
import type { LatLon } from './road-graph.ts';

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

/** A recorded point: where, and seconds since the start. */
export type Recorded = LatLon & { seconds: number };

export type Pace = {
  /** Average speed in meters per second. */
  speed: number;
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
 * drifts slowly around the average, positions stray a little from the road, and a stop
 * shows as a gap in time, as when a device pauses itself.
 */
export function recordRoute(route: LatLon[], pace: Pace, random: () => number): Recorded[] {
  const total = route.slice(1).reduce((sum, p, i) => sum + metres(route[i], p), 0);
  // The speed wanders with two slow waves of random phase, by up to 15% either way.
  const [phaseA, phaseB] = [random() * 2 * Math.PI, random() * 2 * Math.PI];
  const speedAt = (done: number) =>
    pace.speed *
    (1 +
      0.1 * Math.sin((done / 4000) * 2 * Math.PI + phaseA) +
      0.05 * Math.sin(done / 900 + phaseB));
  const jitter = (p: LatLon): LatLon => {
    const angle = random() * 2 * Math.PI;
    const m = random() * GPS_ERROR_M;
    const perLon = 111_320 * Math.cos((p.lat * Math.PI) / 180);
    return {
      lat: p.lat + (m * Math.sin(angle)) / 110_540,
      lon: p.lon + (m * Math.cos(angle)) / perLon,
    };
  };

  const points: Recorded[] = [{ ...route[0], seconds: 0 }];
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
      points.push({ ...jitter(at), seconds: Math.round(seconds) });
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
