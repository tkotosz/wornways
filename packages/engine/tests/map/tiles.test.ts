import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTileLoader, type TileCache } from '../../src/map/tiles.ts';

/** A cache in memory, with the same top-level rule as the real ones. */
function memoryCache(entries: Record<string, string>): TileCache & { keys(): string[] } {
  const store = new Map<string, Uint8Array>(
    Object.entries(entries).map(([k, v]) => [k, new TextEncoder().encode(v)]),
  );
  return {
    read: async (key) => store.get(key),
    write: async (key, data) => void store.set(key, data),
    keepOnly: async (names) => {
      for (const key of [...store.keys()])
        if (!names.includes(key.split('/')[0]!)) store.delete(key);
    },
    keys: () => [...store.keys()].sort(),
  };
}

/** Answers the tile server's address template for `version`, and an empty response for tiles. */
function tileServer(version: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.endsWith('/planet')
        ? Response.json({ tiles: [`https://tiles.example/planet/${version}/{z}/{x}/{y}.pbf`] })
        : new Response(null, { status: 204 }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('createTileLoader', () => {
  it('stores downloaded tiles under the map data version', async () => {
    tileServer('v2');
    const cache = memoryCache({});
    const load = createTileLoader({ cache });

    const result = await load([{ z: 14, x: 1, y: 2 }]);

    expect(result.downloaded).toBe(1);
    expect(cache.keys()).toEqual(['tilejson.json', 'v2/14/1/2.pbf', 'version']);
  });

  it('deletes the tiles of earlier map data versions', async () => {
    tileServer('v2');
    const cache = memoryCache({
      'v1/14/1/2.pbf': 'old',
      'v1/14/1/3.pbf': 'old',
      'tilejson.json': '{"tiles":["https://tiles.example/planet/v1/{z}/{x}/{y}.pbf"]}',
      version: 'v1',
    });

    await createTileLoader({ cache })([{ z: 14, x: 1, y: 2 }]);

    expect(cache.keys()).toEqual(['tilejson.json', 'v2/14/1/2.pbf', 'version']);
  });

  it('keeps the tiles of the current version', async () => {
    tileServer('v2');
    const cache = memoryCache({ 'v2/14/1/2.pbf': 'tile', version: 'v2' });

    const result = await createTileLoader({ cache })([{ z: 14, x: 1, y: 2 }]);

    expect(result.downloaded).toBe(0);
    expect(cache.keys()).toContain('v2/14/1/2.pbf');
  });

  it('returns downloaded tiles when the cache is unavailable', async () => {
    const unavailable = async () => {
      throw new Error('storage unavailable');
    };
    const load = createTileLoader({
      cache: { read: unavailable, write: unavailable, keepOnly: unavailable },
      fetchTile: async (url) =>
        url.endsWith('/planet')
          ? Response.json({ tiles: ['https://tiles.example/v1/{z}/{x}/{y}.pbf'] })
          : new Response('tile'),
    });

    const result = await load([{ z: 14, x: 1, y: 2 }]);
    expect(result.downloaded).toBe(1);
    expect(new TextDecoder().decode(result.tiles[0].data!)).toBe('tile');
  });
});
