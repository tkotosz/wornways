import { STRIDE, type Track } from '@wornways/engine';

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

  clearTrack(id: string): Promise<boolean | undefined> {
    return this.use(async (cache) =>
      cache.delete('/wornways-strava-cache/' + (await this.trackPath(id))),
    );
  }

  track(id: string, version: string): Promise<Pick<Track, 'points' | 'startTime'> | undefined> {
    return this.use(async (cache) => {
      const path = await this.trackPath(id);
      const data = await this.read(cache, path, version);
      if (!data) return;
      const record = new Float64Array(data);
      const startTime = record[0]!;
      const points = record.subarray(1);
      if (!Number.isFinite(startTime) || points.length < 2 * STRIDE || points.length % STRIDE) {
        await cache.delete('/wornways-strava-cache/' + path);
        return;
      }
      return { points, startTime };
    });
  }

  async saveTrack(track: Track, version: string): Promise<void> {
    await this.use(async (cache) => {
      const record = new Float64Array(track.points.length + 1);
      record[0] = track.startTime;
      record.set(track.points, 1);
      await this.write(cache, await this.trackPath(track.id), version, record.buffer);
    });
  }
}
