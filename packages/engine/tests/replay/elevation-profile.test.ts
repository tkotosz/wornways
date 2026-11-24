import { describe, expect, it } from 'vitest';
import { elevationProfile } from '../../src/replay/elevation-profile.ts';
import { projectTrack } from '../../src/replay/project.ts';
import { STRIDE } from '../../src/track/types.ts';

const view = { width: 1080, height: 1920, scale: 2_000_000, offX: 0, offY: 0 };

/** A track heading east, about 75 m between points, with the given elevation at each. */
function withElevations(elevations: number[]) {
  const points = new Float64Array(elevations.length * STRIDE);
  elevations.forEach((ele, i) => points.set([19 + i * 0.001, 47.5, ele, i * 10], i * STRIDE));
  return { points };
}

describe('elevationProfile', () => {
  it('follows a climb and its descent, over the distance the renderer measures', () => {
    const elevations = Array.from({ length: 41 }, (_, i) => 200 + 10 * (20 - Math.abs(20 - i)));
    const track = withElevations(elevations);
    const profile = elevationProfile(track, 20)!;

    expect(profile.totalM).toBeCloseTo(projectTrack(track, view, 0).dist.at(-1)!, 6);
    expect(profile.elevation).toHaveLength(20);
    const top = profile.elevation.indexOf(Math.max(...profile.elevation));
    expect(top).toBeGreaterThanOrEqual(9);
    expect(top).toBeLessThanOrEqual(10);
    expect(profile.elevation[0]).toBeLessThan(230);
    expect(profile.elevation[19]).toBeLessThan(230);
    expect(profile.low).toBeLessThan(230);
    expect(profile.high).toBeGreaterThan(370);
  });

  it('fills in a stretch without elevation from either side of it', () => {
    const elevations = [100, 100, 100, NaN, NaN, NaN, NaN, NaN, 200, 200, 200];
    const profile = elevationProfile(withElevations(elevations), 10)!;

    for (let s = 1; s < 10; s++)
      expect(profile.elevation[s]).toBeGreaterThanOrEqual(profile.elevation[s - 1]);
    expect(profile.elevation[0]).toBeCloseTo(100, 0);
    expect(profile.elevation[9]).toBeCloseTo(200, 0);
  });

  it('draws a flat route flat: the range is at least 60 m', () => {
    const profile = elevationProfile(withElevations([100, 102, 101, 103, 100]), 10)!;

    expect(profile.high - profile.low).toBe(60);
    expect(profile.low).toBeLessThan(100);
    expect(profile.high).toBeGreaterThan(103);
  });

  it('is null without elevation or without distance', () => {
    expect(elevationProfile(withElevations([NaN, NaN, NaN]), 10)).toBeNull();
    const standing = new Float64Array([19, 47.5, 100, 0, 19, 47.5, 100, 10]);
    expect(elevationProfile({ points: standing }, 10)).toBeNull();
  });
});
