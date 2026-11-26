import { describe, expect, it } from 'vitest';
import { chartProfile, chartsOf } from '../../src/replay/charts.ts';
import { projectTrack } from '../../src/replay/project.ts';
import { STRIDE } from '../../src/track/types.ts';

const view = { width: 1080, height: 1920, scale: 2_000_000, offX: 0, offY: 0 };

/** A track heading east, about 75 m between points, with the given elevation at each. */
function withElevations(elevations: number[]) {
  const points = new Float64Array(elevations.length * STRIDE);
  elevations.forEach((ele, i) => points.set([19 + i * 0.001, 47.5, ele, i * 10], i * STRIDE));
  return { points };
}

describe('chartProfile', () => {
  it('follows a climb and its descent, over the distance the renderer measures', () => {
    const elevations = Array.from({ length: 41 }, (_, i) => 200 + 10 * (20 - Math.abs(20 - i)));
    const track = withElevations(elevations);
    const profile = chartProfile([track], 20, 'elevation')!;

    expect(profile.starts.at(-1)!).toBeCloseTo(projectTrack(track, view, 0).dist.at(-1)!, 6);
    expect(profile.values).toHaveLength(20);
    const top = profile.values.indexOf(Math.max(...profile.values));
    expect(top).toBeGreaterThanOrEqual(9);
    expect(top).toBeLessThanOrEqual(10);
    expect(profile.values[0]).toBeLessThan(230);
    expect(profile.values[19]).toBeLessThan(230);
    expect(profile.low).toBeLessThan(230);
    expect(profile.high).toBeGreaterThan(370);
  });

  it('fills in a stretch without elevation from either side of it', () => {
    const elevations = [100, 100, 100, NaN, NaN, NaN, NaN, NaN, 200, 200, 200];
    const profile = chartProfile([withElevations(elevations)], 10, 'elevation')!;

    for (let s = 1; s < 10; s++)
      expect(profile.values[s]).toBeGreaterThanOrEqual(profile.values[s - 1]);
    expect(profile.values[0]).toBeCloseTo(100, 0);
    expect(profile.values[9]).toBeCloseTo(200, 0);
  });

  it('draws a flat route flat: the range is at least 60 m', () => {
    const profile = chartProfile([withElevations([100, 102, 101, 103, 100])], 10, 'elevation')!;

    expect(profile.high - profile.low).toBe(60);
    expect(profile.low).toBeLessThan(100);
    expect(profile.high).toBeGreaterThan(103);
  });

  it('lays several activities end to end by distance, on one height scale', () => {
    const low = withElevations([100, 100, 100, 100, 100]);
    const high = withElevations([500, 500, 500, 500, 500, 500, 500, 500, 500]);
    const profile = chartProfile([low, high], 30, 'elevation')!;
    const lowM = projectTrack(low, view, 0).dist.at(-1)!;
    const highM = projectTrack(high, view, 0).dist.at(-1)!;

    expect(Array.from(profile.starts)).toEqual(
      [0, lowM, lowM + highM].map((m) => expect.closeTo(m, 6)),
    );
    // A third of the strip is the shorter one, at 100 m; the rest at 500 m.
    expect(profile.values[2]).toBeCloseTo(100, 0);
    expect(profile.values[25]).toBeCloseTo(500, 0);
    expect(profile.low).toBeCloseTo(100, 0);
    expect(profile.high).toBeCloseTo(500, 0);
  });

  it('bridges an activity without elevation with a straight line', () => {
    const tracks = [
      withElevations([100, 100, 100]),
      withElevations([NaN, NaN, NaN]),
      withElevations([300, 300, 300]),
    ];
    const profile = chartProfile(tracks, 30, 'elevation')!;

    // The middle third rises steadily from 100 m to 300 m.
    const middle = Array.from(profile.values.slice(11, 19));
    for (let s = 1; s < middle.length; s++) expect(middle[s]).toBeGreaterThan(middle[s - 1]!);
    expect(middle[0]).toBeGreaterThan(100);
    expect(middle.at(-1)).toBeLessThan(300);
  });

  it('is null without elevation or without distance', () => {
    expect(chartProfile([withElevations([NaN, NaN, NaN])], 10, 'elevation')).toBeNull();
    const standing = new Float64Array([19, 47.5, 100, 0, 19, 47.5, 100, 10]);
    expect(chartProfile([{ points: standing }], 10, 'elevation')).toBeNull();
  });
});

describe('the other charts', () => {
  /** A track heading east, about 75 m between points 10 s apart, with heart rate and power. */
  const recorded = (heartRate: number[], power?: number[]) => {
    const track = withElevations(heartRate.map(() => 100));
    return {
      ...track,
      sensors: {
        heartRate: Float32Array.from(heartRate),
        ...(power ? { power: Float32Array.from(power) } : {}),
      },
    };
  };

  it('follows the heart rate and the power along the distance', () => {
    const rising = Array.from({ length: 41 }, (_, i) => 100 + i * 2);
    const profile = chartProfile([recorded(rising)], 10, 'heart-rate')!;
    for (let s = 1; s < 10; s++)
      expect(profile.values[s]).toBeGreaterThanOrEqual(profile.values[s - 1]!);
    expect(profile.values[9]).toBeGreaterThan(160);
    expect(
      chartProfile(
        [
          recorded(
            rising,
            rising.map((v) => v * 2),
          ),
        ],
        10,
        'power',
      ),
    ).not.toBeNull();
  });

  it('works out the speed from the distance and the time between points', () => {
    // About 75 m every 10 s: 7.5 m/s.
    const profile = chartProfile([withElevations(Array(20).fill(100))], 10, 'speed')!;
    expect(profile.values[5]).toBeCloseTo(7.5, 0);
  });

  it('offers the speed always, and the others where an activity recorded them', () => {
    expect(chartsOf([withElevations([100, 110, 120])])).toEqual(['elevation', 'speed']);
    expect(chartsOf([recorded([120, 130, 140], [200, 210, 220])])).toEqual([
      'elevation',
      'heart-rate',
      'power',
      'speed',
    ]);
    expect(chartsOf([withElevations([NaN, NaN, NaN])])).toEqual(['speed']);
  });
});
