/// <reference lib="dom" />

import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GarminExpired, GarminSession } from '../src/worker/garmin.ts';

const from = Date.UTC(2026, 2, 1);
const to = Date.UTC(2026, 3, 1);
const active = () => new AbortController().signal;

const row = (activityId: number, startTimeGMT = '2026-03-10 14:00:00') => ({
  activityId,
  activityName: `Activity ${activityId}`,
  activityType: { typeKey: 'road_biking' },
  startTimeGMT,
  distance: 12_000,
  startLatitude: 47.49,
  startLongitude: 19.05,
  endLatitude: 47.51,
  endLongitude: 19.06,
});

function fakeGarmin(reply: (query: URLSearchParams) => Response | Promise<Response>) {
  const requests: URLSearchParams[] = [];
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    const url = new URL(path, 'https://wornways.test');
    expect(url.pathname).toBe('/api/garmin');
    expect(init.cache).toBe('no-store');
    if (init.method === 'POST') {
      expect(init.body).toBe(JSON.stringify({ key: 'test-key' }));
      return Response.json({ token: 'test-token', expiresAt: Date.now() + 60_000 });
    }
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-token');
    requests.push(url.searchParams);
    return reply(url.searchParams);
  });
  return requests;
}

afterEach(() => vi.unstubAllGlobals());

describe('Garmin Connect session', () => {
  it('reads all search pages and applies the exact period after querying activity-local dates', async () => {
    const requests = fakeGarmin((query) => {
      if (query.get('start') === '0') {
        const before = Array.from({ length: 97 }, (_, i) => row(i + 10, '2026-02-28 23:59:59'));
        return Response.json([
          ...before,
          row(1, '2026-03-01 00:00:00'),
          row(3, '2026-04-01 00:00:00'),
        ]);
      }
      return Response.json([row(2)]);
    });
    const session = await GarminSession.open('test-key', active());
    expect(await session.list(from, to, active())).toEqual([
      {
        id: '2',
        name: 'Activity 2',
        sport: 'ride',
        distanceM: 12_000,
        startTime: Date.UTC(2026, 2, 10, 14),
      },
      { id: '1', name: 'Activity 1', sport: 'ride', distanceM: 12_000, startTime: from },
    ]);
    expect(requests.map((query) => Object.fromEntries(query))).toEqual(
      ['0', '99'].map((start) => ({
        start,
        limit: '99',
        startDate: '2026-02-28',
        endDate: '2026-04-01',
      })),
    );
    expect(session.match({ 'start-near': '47.49,19.05', 'start-radius': '100' }).ids).toEqual([
      '2',
      '1',
    ]);
    expect(session.places({}, 'end')).toHaveLength(1);
    expect(await session.list(null, null, active())).toEqual([]);
    expect(session.match({}).ids).toEqual([]);
    expect(requests).toHaveLength(2);
  });

  it('downloads only selected tracks and drops cached data when access ends', async () => {
    const archive = await readFile(
      new URL('../../../packages/engine/tests/import/fixtures/garmin-export.zip', import.meta.url),
    );
    let revoked = false;
    const requests = fakeGarmin((query) => {
      if (revoked) return new Response(null, { status: 401 });
      if (query.get('activity') === '1') return new Response(new Uint8Array(archive));
      if (query.get('activity') === '3') return new Response(null, { status: 404 });
      return Response.json([row(1), row(2), row(3)]);
    });
    const session = await GarminSession.open('test-key', active());
    await session.list(from, to, active());
    expect(await session.prepare(['1', '3'], active())).toEqual(['3']);
    expect(await session.prepare(['1'], active())).toEqual([]);
    const tracks = await session.selected(['1', '2', '3']);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ id: '1', name: 'Activity 1', sport: 'ride' });
    expect(tracks[0]!.points.length).toBeGreaterThan(4);
    expect(requests.map((query) => query.get('activity'))).toEqual([null, '1', '3']);

    revoked = true;
    await expect(session.prepare(['2'], active())).rejects.toBeInstanceOf(GarminExpired);
    expect(session.signal.aborted).toBe(true);
  });

  it('discards a late activity response from the previous period', async () => {
    let release!: (response: Response) => void;
    const late = new Promise<Response>((resolve) => {
      release = resolve;
    });
    fakeGarmin((query) =>
      query.get('startDate') === '2026-02-28'
        ? late
        : Response.json([row(2, '2026-04-10 14:00:00')]),
    );
    const session = await GarminSession.open('test-key', active());
    const previous = expect(session.list(from, to, active())).rejects.toHaveProperty(
      'name',
      'AbortError',
    );
    await session.list(to, Date.UTC(2026, 4, 1), active());
    release(Response.json([row(1)]));
    await previous;
    expect(session.match({}).ids).toEqual(['2']);
  });
});
