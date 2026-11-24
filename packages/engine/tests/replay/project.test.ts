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

/** A track heading east: a point every 10 s, each `stepDeg` of longitude after the one before. */
function steps(stepsDeg: number[]) {
  const points = new Float64Array((stepsDeg.length + 1) * STRIDE);
  let lon = 19;
  points.set([lon, 47.5, 0, 0], 0);
  stepsDeg.forEach((step, i) => {
    lon += step;
    points.set([lon, 47.5, 0, (i + 1) * 10], (i + 1) * STRIDE);
  });
  return { points };
}

describe('projectTrack', () => {
  it('adds up the climbs and ignores the descents', () => {
    const projected = projectTrack(withElevations([100, 120, 150, 130, 110, 140]), view, 0);

    expect(projected.hasElevation).toBe(true);
    expect(Array.from(projected.climb)).toEqual([0, 20, 50, 50, 50, 80]);
  });

  it('adds up the descents and keeps the highest point so far', () => {
    const projected = projectTrack(withElevations([100, 120, 150, 130, 110, 140]), view, 0);

    expect(Array.from(projected.descent)).toEqual([0, 0, 0, 20, 40, 40]);
    expect(Array.from(projected.top)).toEqual([100, 120, 150, 150, 150, 150]);
  });

  it('counts the time between points covered at walking speed or faster', () => {
    // 0.0004° of longitude is about 30 m: 3 m/s. Standing still in between does not count.
    const moving = projectTrack(steps([0.0004, 0.0004, 0, 0, 0.0004]), view, 0).moving;
    expect(Array.from(moving)).toEqual([0, 10, 20, 20, 20, 30]);
    // About 2 m in 10 s: creeping slower than half a meter a second.
    expect(projectTrack(steps([0.00003, 0.00003]), view, 0).moving.at(-1)).toBe(0);
  });

  it('takes the top speed over ten seconds, so one jump of the GPS hardly counts', () => {
    // A point every 10 s, 0.0004° (about 30 m, 3 m/s) apart, then one point 300 m off and back.
    const steady = projectTrack(steps([0.0004, 0.0004, 0.0004]), view, 0).fastest;
    expect(steady.at(-1)).toBeCloseTo(3.0, 1);
    expect(steady[0]).toBe(0);

    // One second apart, a single point thrown 300 m ahead reads as 300 m/s over that second,
    // but over ten seconds it is far less.
    const points = new Float64Array(13 * STRIDE);
    for (let i = 0; i < 13; i++) points.set([19 + i * 0.00004, 47.5, 0, i], i * STRIDE);
    points[6 * STRIDE] += 0.004;
    const spiky = projectTrack({ points }, view, 0).fastest.at(-1)!;
    expect(spiky).toBeLessThan(70);
    expect(spiky).toBeGreaterThan(3);
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
