import { describe, expect, it } from 'vitest';
import { cleanTrack } from '../../src/track/clean.ts';
import { metresPerDegree } from '../../src/track/geo.ts';
import { STRIDE, pointCount, type Track } from '../../src/track/types.ts';

const LAT = 47.5;
const { perLon } = metresPerDegree(LAT);

/** A run heading east: one point per entry, as [metres east, seconds]. */
function run(steps: [number, number][]): Track {
  const points = new Float64Array(steps.length * STRIDE);
  steps.forEach(([m, t], i) => points.set([19 + m / perLon, LAT, 100, t], i * STRIDE));
  return { id: 'test', sport: 'run', startTime: 0, points };
}

const steady = (count: number): [number, number][] =>
  Array.from({ length: count }, (_, i) => [i * 30, i * 10]);

const eastMost = (track: Track) =>
  Math.max(...Array.from({ length: pointCount(track) }, (_, i) => track.points[i * STRIDE]!));

describe('cleanTrack', () => {
  it('keeps a steady track from start to end', () => {
    const cleaned = cleanTrack(run(steady(60)))!;

    expect(eastMost(cleaned)).toBeCloseTo(19 + (59 * 30) / perLon, 6);
  });

  it('drops a GPS spike far away from the track', () => {
    const steps = steady(60);
    steps[30] = [50_000, 300];

    expect(eastMost(cleanTrack(run(steps))!)).toBeLessThan(19 + 2_000 / perLon);
  });

  it('shortens a long pause', () => {
    const steps = steady(60).map(([m, t], i): [number, number] => [m, i >= 30 ? t + 3_600 : t]);
    const cleaned = cleanTrack(run(steps))!;
    const lastTime = cleaned.points[(pointCount(cleaned) - 1) * STRIDE + 3]!;

    expect(lastTime).toBeLessThan(1_000);
  });

  it('returns null when fewer than two points are left', () => {
    expect(cleanTrack(run([[0, 0]]))).toBeNull();
  });
});
