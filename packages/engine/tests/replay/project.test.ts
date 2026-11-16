import { describe, expect, it } from 'vitest';
import { projectTrack } from '../../src/replay/project.ts';
import { STRIDE } from '../../src/track/types.ts';

const view = { width: 1080, height: 1920, scale: 2_000_000, offX: 0, offY: 0 };

/** A track heading east with the given elevation at each point. */
function withElevations(elevations: number[]) {
  const points = new Float64Array(elevations.length * STRIDE);
  elevations.forEach((ele, i) => points.set([19 + i * 0.001, 47.5, ele, i * 10], i * STRIDE));
  return { points };
}

describe('projectTrack', () => {
  it('adds up the climbs and ignores the descents', () => {
    const projected = projectTrack(withElevations([100, 120, 150, 130, 110, 140]), view, 0);

    expect(projected.hasElevation).toBe(true);
    expect(Array.from(projected.climb)).toEqual([0, 20, 50, 50, 50, 80]);
  });

  it('takes small ups and downs for noise', () => {
    const projected = projectTrack(withElevations([100, 101, 99, 102, 100, 101]), view, 0);

    expect(projected.climb.at(-1)).toBe(0);
  });

  it('reports a track without elevation', () => {
    const projected = projectTrack(withElevations([NaN, NaN, NaN]), view, 0);

    expect(projected.hasElevation).toBe(false);
    expect(projected.climb.at(-1)).toBe(0);
  });
});
