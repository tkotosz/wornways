// The Ride with GPS tracks downloaded so far, kept in the browser while the account is
// connected, so a period used before is not downloaded again. Each track is stored with the
// trip's version (when it last changed); a track of another version is not used. Clearing
// happens on disconnect. Storing is optional: when the browser refuses, tracks are fetched.
// Each track also carries what the list says of its trip (name, date, sport, distance), so
// the list of sources and the connection's popup can show what is kept without asking Ride
// with GPS.

import type { Track } from '@wornways/engine';
import type { ActivitySummary } from '../messages.ts';
import { decodeTrack, encodeTrack, type TrackRecord } from './track-record.ts';

const NAME = 'wornways-rwgps-tracks';
const VERSION = 'X-Wornways-Version';
/** The trip's summary as URI-encoded JSON: header values cannot hold every character. */
const SUMMARY = 'X-Wornways-Summary';
const address = (id: string) => `/wornways-rwgps-cache/${encodeURIComponent(id)}`;

async function use<T>(operation: (cache: Cache) => Promise<T>): Promise<T | undefined> {
  try {
    return await operation(await caches.open(NAME));
  } catch {
    return undefined;
  }
}

/** The stored track of this version of a trip: its start time, points and sensor values. */
export function cachedTrack(id: string, version: string): Promise<TrackRecord | undefined> {
  return use(async (cache) => {
    const entry = await cache.match(address(id));
    if (!entry) return;
    if (entry.headers.get(VERSION) !== version) {
      await cache.delete(address(id));
      return;
    }
    const track = decodeTrack(new Float64Array(await entry.arrayBuffer()));
    if (!track) await cache.delete(address(id));
    return track;
  });
}

export async function cacheTrack(
  track: Track,
  version: string,
  summary: ActivitySummary,
): Promise<void> {
  await use(async (cache) => {
    const record = encodeTrack(track);
    const headers = { [VERSION]: version, [SUMMARY]: encodeURIComponent(JSON.stringify(summary)) };
    await cache.put(address(track.id), new Response(record, { headers }));
  });
}

/**
 * What the stored tracks are, newest first. A track stored without its summary is deleted:
 * it is fetched again, with one, when a video needs it.
 */
export async function cachedSummaries(): Promise<ActivitySummary[]> {
  const list =
    (await use(async (cache) => {
      const found: ActivitySummary[] = [];
      for (const request of await cache.keys()) {
        const summary = (await cache.match(request))?.headers.get(SUMMARY);
        if (summary) found.push(JSON.parse(decodeURIComponent(summary)) as ActivitySummary);
        else await cache.delete(request);
      }
      return found;
    })) ?? [];
  return list.sort((a, b) => b.startTime - a.startTime);
}

/** Deletes these trips' stored tracks. */
export async function deleteCachedTracks(ids: string[]): Promise<void> {
  await use((cache) => Promise.all(ids.map((id) => cache.delete(address(id)))));
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
