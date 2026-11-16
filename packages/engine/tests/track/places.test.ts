import { describe, expect, it } from 'vitest';
import { frequentPlaces } from '../../src/track/places.ts';
import { STRIDE } from '../../src/track/types.ts';

/** An activity starting at the given place on the given day of 2026, ending 0.01° east. */
function startingAt(lat: number, lon: number, day: number) {
  const points = new Float64Array(2 * STRIDE);
  points.set([lon, lat, 0, 0, lon + 0.01, lat, 0, 600]);
  return { points, startTime: Date.UTC(2026, 0, day) };
}

describe('frequentPlaces', () => {
  // Five starts near an old home, three near a new one, one somewhere else.
  const tracks = [
    startingAt(47.5, 19.0, 1),
    startingAt(47.5005, 19.0004, 2),
    startingAt(47.4996, 19.0, 3),
    startingAt(47.5, 18.9993, 4),
    startingAt(47.5003, 19.0, 5),
    startingAt(46.9, 17.9, 20),
    startingAt(46.9004, 17.9, 21),
    startingAt(46.9, 17.9006, 22),
    startingAt(45.0, 15.0, 30),
  ];

  it('finds each place many activities start from, the busiest first', () => {
    const places = frequentPlaces(tracks, 'start', 500, 5);

    expect(places.map((p) => p.count)).toEqual([5, 3]);
    expect(places[0]!.lat).toBeCloseTo(47.5, 3);
    expect(places[1]!.lon).toBeCloseTo(17.9, 3);
    expect(places[1]!.first).toBe(Date.UTC(2026, 0, 20));
    expect(places[1]!.last).toBe(Date.UTC(2026, 0, 22));
  });

  it('stops at the limit, and at places with too few starts', () => {
    expect(frequentPlaces(tracks, 'start', 500, 1)).toHaveLength(1);
    expect(frequentPlaces(tracks, 'start', 500, 5, 1)).toHaveLength(3);
    expect(frequentPlaces([], 'start', 500, 5)).toEqual([]);
  });

  it('finds where activities end, too', () => {
    const [busiest] = frequentPlaces(tracks, 'end', 500, 5);

    expect(busiest!.count).toBe(5);
    expect(busiest!.lon).toBeCloseTo(19.01, 3);
  });
});
