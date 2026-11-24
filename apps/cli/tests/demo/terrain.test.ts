import { distanceM } from '@wornways/engine';
import { describe, expect, it } from 'vitest';
import {
  alongRoute,
  heightsFrom,
  routeHeights,
  terrariumMeters,
  TERRAIN_ZOOM,
} from '../../src/demo/terrain.ts';

describe('terrariumMeters', () => {
  it('reads red × 256 + green + blue / 256 − 32768', () => {
    // 0 m, 682.5 m, and 20 m below the sea.
    const rgba = new Uint8ClampedArray([128, 0, 0, 255, 130, 170, 128, 255, 127, 236, 0, 255]);
    expect(Array.from(terrariumMeters(rgba))).toEqual([0, 682.5, -20]);
  });
});

describe('heightsFrom', () => {
  /** The tile at the terrain zoom holding this place, with its pixel. */
  const tileOf = (lat: number, lon: number) => {
    const size = 2 ** TERRAIN_ZOOM * 256;
    const s = Math.sin((lat * Math.PI) / 180);
    const x = ((lon + 180) / 360) * size;
    const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size;
    return { tx: Math.floor(x / 256), ty: Math.floor(y / 256), px: x % 256, py: y % 256 };
  };

  it('reads between pixel centers, and refuses a place on a tile not loaded', () => {
    const { tx, ty } = tileOf(39.8, 2.8);
    // Heights rising 10 m per pixel to the east.
    const tile = new Float32Array(256 * 256).map((_, i) => (i % 256) * 10);
    const heightAt = heightsFrom(new Map([[`${tx}/${ty}`, tile]]));

    // Pick a place half way between two pixel centers, inside the tile.
    const size = 2 ** TERRAIN_ZOOM * 256;
    const lon = ((tx * 256 + 100 + 1) / size) * 360 - 180; // pixel 100's right edge
    const lat = 39.8;
    if (tileOf(lat, lon).ty !== ty) throw new Error('test place left the tile');
    expect(heightAt({ lat, lon })).toBeCloseTo(1005, 3);
    expect(() => heightAt({ lat: 39.8, lon: 10 })).toThrow('No terrain tile');
  });
});

describe('routeHeights', () => {
  // A straight road 2 km east.
  const road = [
    { lat: 39.8, lon: 3 },
    { lat: 39.8, lon: 3.0234 },
  ];
  const length = distanceM(39.8, 3, 39.8, 3.0234);

  it('reads every 20 m along the route, and its end', () => {
    const places = alongRoute(road);
    expect(places).toHaveLength(Math.ceil(length / 20) + 1);
    expect(places.at(-1)).toEqual(road[1]);
  });

  it('gives the height and gradient along a steady climb', () => {
    // 5% up: the height grows 1 m per 20 m east.
    const heightAt = ({ lon }: { lon: number }) => ((lon - 3) / 0.0234) * length * 0.05;
    const heights = routeHeights(alongRoute(road), heightAt);

    expect(heights.at(1000)).toBeCloseTo(50, 0);
    expect(heights.grade(1000)).toBeCloseTo(0.05, 3);
    // The ends keep their own height, and the first 100 m their gradient.
    expect(heights.at(0)).toBeCloseTo(0, 3);
    expect(heights.at(length)).toBeCloseTo(length * 0.05, 0);
    expect(heights.grade(0)).toBeCloseTo(0.05, 3);
  });

  it('averages out a single bump over 200 m', () => {
    // Flat, but one place on the road reads 100 m higher, as a cliff next to it would.
    const places = alongRoute(road);
    const bump = places[50]!;
    const heights = routeHeights(places, (p) => (p === bump ? 100 : 0));

    expect(heights.at(1000)).toBeLessThan(10);
    expect(heights.at(1000)).toBeGreaterThan(0);
  });
});
