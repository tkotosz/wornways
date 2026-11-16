// Map tiles kept in the browser's Cache Storage, which survives between visits.

import type { TileCache } from '@wornways/engine';

const CACHE_NAME = 'wornways-map-tiles';

/** Cache Storage keys are requests; a path under this site names each entry. */
const requestFor = (key: string) => `/${CACHE_NAME}/${key}`;

export const cacheStorageTileCache: TileCache = {
  async read(key) {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(requestFor(key));
    return response === undefined ? undefined : new Uint8Array(await response.arrayBuffer());
  },
  async write(key, data) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(requestFor(key), new Response(data.slice()));
  },
  async keepOnly(topLevelNames) {
    const cache = await caches.open(CACHE_NAME);
    const kept = topLevelNames.map((name) => new URL(requestFor(name), self.location.origin));
    for (const request of await cache.keys()) {
      const url = new URL(request.url);
      const keep = kept.some(
        (k) => url.pathname === k.pathname || url.pathname.startsWith(`${k.pathname}/`),
      );
      if (!keep) await cache.delete(request);
    }
  },
};
