// Heights for the demo routes, from Terrain Tiles: open elevation data on AWS, as PNG tiles
// in the "terrarium" encoding. For Mallorca at zoom 12 they hold SRTM heights (U.S.
// Geological Survey) on land and ETOPO1 (U.S. NOAA) at sea, about 30 m per pixel.
// See https://registry.opendata.aws/terrain-tiles/ and the attribution in main.ts.

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { distanceM, type TileCache } from '@wornways/engine';
import type { LatLon } from './road-graph.ts';

/** Zoom 12 is about 30 m per pixel at Mallorca's latitude, the resolution of SRTM. */
export const TERRAIN_ZOOM = 12;
const TILE_SIZE = 256;
const tileUrl = (x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${TERRAIN_ZOOM}/${x}/${y}.png`;
/** Downloads at a time. */
const PARALLEL = 4;

/** The height in meters at a place. */
export type HeightAt = (p: LatLon) => number;

/** The heights of a terrarium tile's pixels, in meters: red × 256 + green + blue / 256 − 32768. */
export function terrariumMeters(rgba: Uint8ClampedArray): Float32Array {
  const meters = new Float32Array(rgba.length / 4);
  for (let i = 0; i < meters.length; i++)
    meters[i] = rgba[i * 4] * 256 + rgba[i * 4 + 1] + rgba[i * 4 + 2] / 256 - 32768;
  return meters;
}

/** Where a place falls on the whole world's pixels at the terrain zoom. */
function worldPixel({ lat, lon }: LatLon): { x: number; y: number } {
  const size = 2 ** TERRAIN_ZOOM * TILE_SIZE;
  const s = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * size,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size,
  };
}

/** The four pixels whose centers surround a place, and how far it is between them. */
function around(p: LatLon) {
  const { x, y } = worldPixel(p);
  const x0 = Math.floor(x - 0.5);
  const y0 = Math.floor(y - 0.5);
  return { x0, y0, fx: x - 0.5 - x0, fy: y - 0.5 - y0 };
}

const tileKey = (x: number, y: number) => `${x}/${y}`;

/**
 * Heights from decoded tiles, keyed "x/y" at the terrain zoom: between the four nearest
 * pixel centers, weighted by distance (bilinear). A place on a tile not given is an error.
 */
export function heightsFrom(tiles: Map<string, Float32Array>): HeightAt {
  const pixel = (x: number, y: number) => {
    const tile = tiles.get(tileKey(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE)));
    if (!tile) throw new Error(`No terrain tile for pixel ${x}, ${y}`);
    return tile[(y % TILE_SIZE) * TILE_SIZE + (x % TILE_SIZE)];
  };
  return (p) => {
    const { x0, y0, fx, fy } = around(p);
    const top = pixel(x0, y0) * (1 - fx) + pixel(x0 + 1, y0) * fx;
    const bottom = pixel(x0, y0 + 1) * (1 - fx) + pixel(x0 + 1, y0 + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  };
}

/**
 * Loads the terrain tiles the given places need, from the cache or the network, and gives
 * their heights.
 */
export async function loadTerrain(
  places: LatLon[],
  cache: TileCache,
  userAgent: string,
): Promise<{ heightAt: HeightAt; tiles: number; downloaded: number }> {
  const needed = new Map<string, { x: number; y: number }>();
  for (const p of places) {
    // The tiles of the four pixels a height is read from.
    const { x0, y0 } = around(p);
    for (const x of [x0, x0 + 1])
      for (const y of [y0, y0 + 1]) {
        const [tx, ty] = [Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE)];
        needed.set(tileKey(tx, ty), { x: tx, y: ty });
      }
  }

  const tiles = new Map<string, Float32Array>();
  let downloaded = 0;
  const queue = [...needed.values()];
  const work = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const key = `${TERRAIN_ZOOM}/${next.x}/${next.y}.png`;
      let png = await cache.read(key);
      if (!png) {
        const response = await fetch(tileUrl(next.x, next.y), {
          headers: { 'User-Agent': userAgent },
        });
        if (!response.ok)
          throw new Error(`Terrain tile ${key}: ${response.status} ${response.statusText}`);
        png = new Uint8Array(await response.arrayBuffer());
        await cache.write(key, png);
        downloaded++;
      }
      const image = await loadImage(Buffer.from(png));
      const canvas = createCanvas(TILE_SIZE, TILE_SIZE);
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      tiles.set(
        tileKey(next.x, next.y),
        terrariumMeters(context.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data),
      );
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, work));
  return { heightAt: heightsFrom(tiles), tiles: tiles.size, downloaded };
}

/** Heights along a route are read this far apart, in meters. */
const SAMPLE_M = 20;
/**
 * Heights are averaged over this much of the route, in meters: next to winding mountain
 * roads, 30 m pixels also catch the slope beside the road, and the climb would add up to
 * far more than a ride records.
 */
const SMOOTH_M = 200;
/** A gradient is measured over this much of the route, in meters. */
const GRADE_M = 100;

/** A route's height and gradient, by meters from its start. */
export type RouteHeights = {
  at(done: number): number;
  /** Rise over run: 0.05 is a 5% climb, negative downhill. */
  grade(done: number): number;
};

/** Places every 20 m along `route`, from its start, and its end: where heights are read. */
export function alongRoute(route: LatLon[]): LatLon[] {
  const places: LatLon[] = [];
  let carried = 0; // meters into the current leg where the next place falls
  for (let i = 1; i < route.length; i++) {
    const [a, b] = [route[i - 1], route[i]];
    const length = distanceM(a.lat, a.lon, b.lat, b.lon);
    for (; carried < length; carried += SAMPLE_M) {
      const f = carried / length;
      places.push({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f });
    }
    carried -= length;
  }
  places.push(route[route.length - 1]);
  return places;
}

/** The heights along a route, from its places of `alongRoute`, averaged over 200 m of it. */
export function routeHeights(places: LatLon[], heightAt: HeightAt): RouteHeights {
  const raw = places.map(heightAt);

  // A moving average, from running sums.
  const reach = Math.round(SMOOTH_M / SAMPLE_M / 2);
  const sums = [0];
  for (const h of raw) sums.push(sums[sums.length - 1] + h);
  const smooth = raw.map((_, i) => {
    // Near either end the window narrows on both sides, so the route starts and ends at
    // its own height rather than at the average of what comes after or before it.
    const half = Math.min(reach, i, raw.length - 1 - i);
    return (sums[i + half + 1] - sums[i - half]) / (2 * half + 1);
  });

  const last = smooth.length - 1;
  const at = (done: number) => {
    const s = Math.min(last, Math.max(0, done / SAMPLE_M));
    const i = Math.min(last - 1, Math.floor(s));
    if (i < 0) return smooth[0];
    return smooth[i] + (smooth[i + 1] - smooth[i]) * (s - i);
  };
  const end = last * SAMPLE_M;
  return {
    at,
    grade(done) {
      const from = Math.max(0, Math.min(end - GRADE_M, done - GRADE_M / 2));
      return end < GRADE_M ? 0 : (at(from + GRADE_M) - at(from)) / GRADE_M;
    },
  };
}
