import type { Track } from '@wornways/engine';
import type { ActivitySummary } from '../messages.ts';
import { decodeTrack, encodeTrack, type TrackRecord } from './track-record.ts';

const PREFIX = 'wornways-strava-';
const encoder = new TextEncoder();

/** Remove expired sessions on startup, including sessions whose tab was closed. */
export async function pruneStravaCaches(now = Date.now()): Promise<void> {
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => {
          if (!name.startsWith(PREFIX)) return false;
          const expiresAt = Number(name.slice(PREFIX.length).split('-')[0]);
          return !Number.isFinite(expiresAt) || expiresAt <= now;
        })
        .map((name) => caches.delete(name)),
    );
  } catch {
    // Browsers can disable storage. Activities can still be read from Strava.
  }
}

export class StravaCache<T> {
  private opening?: Promise<Cache>;
  private clearing: Promise<unknown> = Promise.resolve();
  private key?: Promise<CryptoKey>;
  private readonly name: string;

  constructor(
    sessionId: string,
    private readonly expiresAt: number,
    private readonly secret: string,
  ) {
    this.name = PREFIX + expiresAt + '-' + sessionId;
  }

  private async use<V>(operation: (cache: Cache) => Promise<V>): Promise<V | undefined> {
    if (Date.now() >= this.expiresAt) return;
    try {
      const cache = await (this.opening ??= this.clearing.then(() => caches.open(this.name)));
      if (Date.now() < this.expiresAt) return await operation(cache);
    } catch {
      // Caching is optional, including when the browser runs out of space.
    }
  }

  clear(): Promise<unknown> {
    const opening = this.opening;
    this.opening = undefined;
    this.clearing = Promise.all([this.clearing, opening?.catch(() => {})])
      .then(() => caches.delete(this.name))
      .catch(() => {});
    return this.clearing;
  }

  /** The key is only available while the browser has the encrypted sign-in cookie. */
  private encryptionKey(): Promise<CryptoKey> {
    return (this.key ??= this.digest('cache-encryption').then((material) =>
      crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']),
    ));
  }

  private digest(purpose: string): Promise<ArrayBuffer> {
    return crypto.subtle.digest(
      'SHA-256',
      encoder.encode(purpose + ':' + this.name + ':' + this.secret),
    );
  }

  private async trackPath(id: string): Promise<string> {
    const digest = await this.digest('track:' + id);
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    return 'tracks/' + hash;
  }

  private async read(
    cache: Cache,
    path: string,
    version: string,
  ): Promise<ArrayBuffer | undefined> {
    const request = '/wornways-strava-cache/' + path;
    const entry = await cache.match(request);
    if (!entry) return;
    const data = await entry.arrayBuffer();
    try {
      return await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: data.slice(0, 12),
          additionalData: encoder.encode(path + ':' + version),
        },
        await this.encryptionKey(),
        data.slice(12),
      );
    } catch {
      await cache.delete(request);
    }
  }

  private async write(
    cache: Cache,
    path: string,
    version: string,
    data: ArrayBuffer,
  ): Promise<void> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(path + ':' + version) },
      await this.encryptionKey(),
      data,
    );
    await cache.put('/wornways-strava-cache/' + path, new Response(new Blob([iv, encrypted])));
  }

  list(): Promise<T[] | undefined> {
    return this.use(async (cache) => {
      const data = await this.read(cache, 'activities', '1');
      return data ? (JSON.parse(new TextDecoder().decode(data)) as T[]) : undefined;
    });
  }

  async saveList(list: T[]): Promise<void> {
    await this.use((cache) =>
      this.write(cache, 'activities', '1', encoder.encode(JSON.stringify(list)).buffer),
    );
  }

  async clearTrack(id: string): Promise<void> {
    await this.use(async (cache) =>
      cache.delete('/wornways-strava-cache/' + (await this.trackPath(id))),
    );
    await this.index((list) => list.filter((row) => row.id !== id));
  }

  /** What the stored tracks are, for the person to see what this device keeps. */
  async downloaded(): Promise<ActivitySummary[]> {
    await this.indexing;
    return (await this.readIndex()) ?? [];
  }

  // The tracks' paths are hashes, so a list of what they are is kept beside them, encrypted
  // the same way. Tracks are stored a few at a time, so its changes go one after another.
  private indexing: Promise<unknown> = Promise.resolve();

  private readIndex(): Promise<ActivitySummary[] | undefined> {
    return this.use(async (cache) => {
      const data = await this.read(cache, 'downloaded', '1');
      return data ? (JSON.parse(new TextDecoder().decode(data)) as ActivitySummary[]) : [];
    });
  }

  /** Adds a track read from the cache that the index does not list yet. */
  noteTrack(summary: ActivitySummary): Promise<unknown> {
    return this.index((list) =>
      list.some((row) => row.id === summary.id) ? list : [...list, summary],
    );
  }

  /** Changes the index; a change that returns the same list writes nothing. */
  private index(change: (list: ActivitySummary[]) => ActivitySummary[]): Promise<unknown> {
    this.indexing = this.indexing
      .then(async () => {
        const before = (await this.readIndex()) ?? [];
        const list = change(before);
        if (list === before) return;
        await this.use((cache) =>
          this.write(cache, 'downloaded', '1', encoder.encode(JSON.stringify(list)).buffer),
        );
      })
      .catch(() => {});
    return this.indexing;
  }

  track(id: string, version: string): Promise<TrackRecord | undefined> {
    return this.use(async (cache) => {
      const path = await this.trackPath(id);
      const data = await this.read(cache, path, version);
      if (!data) return;
      const track = decodeTrack(new Float64Array(data));
      if (!track) await cache.delete('/wornways-strava-cache/' + path);
      return track;
    });
  }

  async saveTrack(track: Track, version: string, summary: ActivitySummary): Promise<void> {
    await this.use(async (cache) => {
      const record = encodeTrack(track);
      await this.write(cache, await this.trackPath(track.id), version, record.buffer);
    });
    await this.index((list) => [...list.filter((row) => row.id !== summary.id), summary]);
  }
}
