import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sportSlug } from '../../src/import/index-csv.ts';
import { formatFromFilename, parseActivity } from '../../src/import/parse.ts';
import { pointCount } from '../../src/track/types.ts';

function parseFixture(name: string) {
  const bytes = readFileSync(new URL(`fixtures/${name}`, import.meta.url));
  return parseActivity(bytes, formatFromFilename(name)!);
}

describe('parseActivity', () => {
  it.each([
    ['morning-ride.fit', 'ride', '2026-05-02T08:15:00.000Z', 650],
    ['morning-ride.gpx', 'ride', '2026-05-02T08:15:00.000Z', 650],
    ['trail-run.tcx', 'run', '2026-04-27T15:20:00.000Z', 721],
  ])('reads the track of %s', (file, sport, start, points) => {
    const activity = parseFixture(file)!;

    expect(activity.sport).toBe(sport);
    expect(new Date(activity.startTime).toISOString()).toBe(start);
    expect(pointCount(activity)).toBe(points);
  });

  it.each(['indoor-ride.fit', 'no-gps-data.gpx'])(
    'returns null for %s, which has no GPS',
    (file) => {
      expect(parseFixture(file)).toBeNull();
    },
  );

  it.each([
    ['broken.fit', 'not a FIT file'],
    ['broken.gpx', 'not a GPX file'],
  ])('rejects %s', (file, message) => {
    expect(() => parseFixture(file)).toThrow(message);
  });
});

describe('sportSlug', () => {
  it.each([
    ['Alpine Ski', 'alpine-ski'],
    ['AlpineSki', 'alpine-ski'],
    ['alpine_ski', 'alpine-ski'],
    ['E-Bike Ride', 'e-bike-ride'],
    ['EBikeRide', 'e-bike-ride'],
    ['VirtualRide', 'virtual-ride'],
    [' Ride ', 'ride'],
  ])('names %j %j', (name, slug) => {
    expect(sportSlug(name)).toBe(slug);
  });
});
