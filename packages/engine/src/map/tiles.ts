// Map tiles from OpenFreeMap (https://openfreemap.org): OpenStreetMap data in the
// OpenMapTiles schema, free and without an API key. Tiles are kept in a cache the front
// end provides, so an area is downloaded once.

import { gunzip, isGzip } from '../import/unpack.ts';
import type { Tile, TileId } from './basemap.ts';

const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
/**
 * The credit drawn on every frame that shows the map, worded as OpenFreeMap asks for video
 * (https://openfreemap.org, checked 2026-11-16).
 */
export const MAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap';
/** The most detailed zoom level the tile server offers. */
export const MAX_TILE_ZOOM = 14;
/** Tiles downloaded at the same time: OpenFreeMap's terms allow at most 4. */
const CONCURRENCY = 4;
const TIMEOUT_MS = 20_000;

/**
 * Keeps downloaded map data between runs. Keys are paths: a tile is stored under its map
 * data version, e.g. "20261101_080013_pt/14/9000/5700.pbf"; "tilejson.json" and "version"
 * hold the tile address template and the version last used.
 */
export type TileCache = {
  /** The stored data, or undefined when nothing is stored under the key. */
  read(key: string): Promise<Uint8Array | undefined>;
  write(key: string, data: Uint8Array): Promise<void>;
  /** Deletes every entry whose key does not start with one of these top-level names. */
  keepOnly(topLevelNames: string[]): Promise<void>;
};

export type TileLoad = { tiles: Tile[]; downloaded: number };

/** Loads the tiles with the given ids, from the cache where it has them. */
export type TileLoader = (ids: TileId[]) => Promise<TileLoad>;

export type TileLoaderOptions = {
  cache: TileCache;
  /** Sent with every request where the platform allows it, naming the app. */
  userAgent?: string;
};

type TileJson = { tiles: string[] };

/** A tile loader that downloads from OpenFreeMap and keeps every tile in `cache`. */
export function createTileLoader(options: TileLoaderOptions): TileLoader {
  const { cache } = options;
  const headers: Record<string, string> = options.userAgent
    ? { 'User-Agent': options.userAgent }
    : {};
  const get = (url: string) => fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });

  /** The current tile URL template. Falls back to the last one seen when offline. */
  async function tileJson(): Promise<TileJson> {
    try {
      const res = await get(TILEJSON_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as TileJson;
      if (!json.tiles?.[0]) throw new Error('no tile URL in the response');
      await cache.write('tilejson.json', new TextEncoder().encode(JSON.stringify(json)));
      return json;
    } catch (err) {
      const cached = await cache.read('tilejson.json');
      if (cached) return JSON.parse(new TextDecoder().decode(cached)) as TileJson;
      throw new Error(
        `could not reach the map tile service (${err instanceof Error ? err.message : err})`,
        { cause: err },
      );
    }
  }

  return async (ids) => {
    const template = (await tileJson()).tiles[0];
    // The template carries a dataset version (".../planet/20261101_080013_pt/{z}/..."); keep
    // versions apart so one map never mixes two snapshots of the data.
    const version = /\/([^/{}]+)\/\{z\}/.exec(template)?.[1] ?? 'unversioned';
    // A new version makes the tiles of the earlier ones useless: delete them, once.
    const lastVersion = await cache.read('version');
    if (lastVersion === undefined || new TextDecoder().decode(lastVersion) !== version) {
      await cache.keepOnly([version, 'tilejson.json']);
      await cache.write('version', new TextEncoder().encode(version));
    }

    let downloaded = 0;
    async function load(id: TileId): Promise<Tile> {
      const key = `${version}/${id.z}/${id.x}/${id.y}.pbf`;
      let data = await cache.read(key);
      if (data === undefined) {
        const url = template
          .replace('{z}', String(id.z))
          .replace('{x}', String(id.x))
          .replace('{y}', String(id.y));
        const res = await get(url);
        if (res.status === 404 || res.status === 204)
          data = new Uint8Array(0); // nothing there, e.g. open sea
        else if (!res.ok) throw new Error(`map tile ${id.z}/${id.x}/${id.y}: HTTP ${res.status}`);
        else data = new Uint8Array(await res.arrayBuffer());
        if (isGzip(data)) data = await gunzip(data);
        await cache.write(key, data);
        downloaded++;
      }
      return { ...id, data: data.length > 0 ? data : null };
    }

    const tiles: Tile[] = new Array(ids.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, ids.length) }, async () => {
        while (next < ids.length) {
          const i = next++;
          tiles[i] = await load(ids[i]);
        }
      }),
    );
    return { tiles, downloaded };
  };
}
