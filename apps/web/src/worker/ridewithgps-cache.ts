// The Ride with GPS tracks downloaded so far, kept in the browser while the account is
// connected, so a period used before is not downloaded again. Each track is stored with the
// trip's version (when it last changed); a track of another version is not used. Clearing
// happens on disconnect. Storing is optional: when the browser refuses, tracks are fetched.

import { STRIDE, type Track } from '@wornways/engine';

const NAME = 'wornways-rwgps-tracks';
const VERSION = 'X-Wornways-Version';
const address = (id: string) => `/wornways-rwgps-cache/${encodeURIComponent(id)}`;

async function use<T>(operation: (cache: Cache) => Promise<T>): Promise<T | undefined> {
  try {
    return await operation(await caches.open(NAME));
  } catch {
    return undefined;
  }
}

/** The stored track of this version of a trip: its start time and points. */
export function cachedTrack(
  id: string,
  version: string,
): Promise<Pick<Track, 'startTime' | 'points'> | undefined> {
  return use(async (cache) => {
    const entry = await cache.match(address(id));
    if (!entry) return;
    if (entry.headers.get(VERSION) !== version) {
      await cache.delete(address(id));
      return;
    }
    // Stored as [start time, ...points].
    const record = new Float64Array(await entry.arrayBuffer());
    const points = record.subarray(1);
    if (!Number.isFinite(record[0]) || points.length < 2 * STRIDE || points.length % STRIDE) {
      await cache.delete(address(id));
      return;
    }
    return { startTime: record[0]!, points };
  });
}

export async function cacheTrack(track: Track, version: string): Promise<void> {
  await use(async (cache) => {
    const record = new Float64Array(track.points.length + 1);
    record[0] = track.startTime;
    record.set(track.points, 1);
    await cache.put(address(track.id), new Response(record, { headers: { [VERSION]: version } }));
  });
}

/** Removes the tracks of trips that are no longer in the account's list. */
export async function keepCachedTracks(ids: Set<string>): Promise<void> {
  await use(async (cache) => {
    const stored = await cache.keys();
    const gone = stored.filter((request) => {
      const id = decodeURIComponent(new URL(request.url).pathname.split('/').pop() ?? '');
      return !ids.has(id);
    });
    await Promise.all(gone.map((request) => cache.delete(request)));
  });
}

export async function clearCachedTracks(): Promise<void> {
  await caches.delete(NAME).catch(() => false);
}
