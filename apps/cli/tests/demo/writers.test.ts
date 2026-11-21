import { importFiles } from '@wornways/engine';
import { describe, expect, it } from 'vitest';
import { recordRoute, seededRandom } from '../../src/demo/timing.ts';
import { activitiesCsv, gpxFile, zipFile } from '../../src/demo/writers.ts';

// A straight 2 km road heading east, as three points.
const route = [
  { lat: 39.8, lon: 3 },
  { lat: 39.8, lon: 3.0117 },
  { lat: 39.8, lon: 3.0234 },
];

describe('recordRoute', () => {
  it('records a point at least every interval, at about the given speed', () => {
    const points = recordRoute(route, { speed: 5, interval: 10 }, seededRandom(1));
    const gaps = points.slice(1).map((p, i) => p.seconds - points[i].seconds);

    expect(Math.max(...gaps)).toBeLessThanOrEqual(11);
    expect(points.at(-1)!.seconds).toBeGreaterThan(2000 / 5 / 1.2);
    expect(points.at(-1)!.seconds).toBeLessThan(2000 / 5 / 0.8);
  });

  it('shows a stop as a gap in time, and gives the same points for the same seed', () => {
    const pace = { speed: 5, interval: 10, stop: { at: 0.5, seconds: 600 } };
    const points = recordRoute(route, pace, seededRandom(7));
    const gaps = points.slice(1).map((p, i) => p.seconds - points[i].seconds);

    expect(Math.max(...gaps)).toBeGreaterThanOrEqual(600);
    expect(recordRoute(route, pace, seededRandom(7))).toEqual(points);
  });
});

describe('the demo export', () => {
  it('is read by the importer with its names, sports and times', async () => {
    const start = new Date('2026-04-02T07:40:00Z');
    const points = recordRoute(route, { speed: 7, interval: 10 }, seededRandom(3));
    const encoder = new TextEncoder();
    const zip = zipFile([
      {
        path: 'activities.csv',
        data: encoder.encode(
          activitiesCsv([
            {
              id: 'demo-1',
              start,
              name: 'Coast, "windy"',
              type: 'Ride',
              seconds: 300,
              file: 'activities/demo-1.gpx',
            },
          ]),
        ),
      },
      {
        path: 'activities/demo-1.gpx',
        data: encoder.encode(gpxFile('Coast', 'cycling', start, points)),
      },
    ]);
    const file = {
      name: 'demo.zip',
      size: zip.length,
      read: async (offset: number, length: number) => zip.subarray(offset, offset + length),
    };

    const result = await importFiles([file]);

    expect(result.unreadable).toEqual([]);
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]).toMatchObject({
      id: 'demo-1',
      name: 'Coast, "windy"',
      sport: 'ride',
      startTime: start.getTime(),
    });
    expect(zipFile([{ path: 'a.txt', data: encoder.encode('a') }])).toEqual(
      zipFile([{ path: 'a.txt', data: encoder.encode('a') }]),
    );
  });
});
