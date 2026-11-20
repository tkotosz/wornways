import { describe, expect, it } from 'vitest';
import { chronologicalTimeline, raceTimeline } from '../../src/replay/timeline.ts';

it('finishes a real-pace group within its window even when it lasts less than 100 ms', () => {
  const timeline = raceTimeline([45, 60], { duration: 0.05, lead: 0, hold: 0 });
  expect(timeline.duration).toBeCloseTo(0.05);
  expect(timeline.progress(1, 0.05)).toBeCloseTo(1);
});

describe('chronologicalTimeline', () => {
  const timeline = chronologicalTimeline([5_000, 20_000, 1_000], { duration: 15 });

  it('starts with nothing drawn and ends with every track complete', () => {
    for (const index of [0, 1, 2]) {
      expect(timeline.progress(index, 0)).toBe(0);
      expect(timeline.progress(index, 15)).toBe(1);
    }
  });

  it('never takes back progress', () => {
    for (const index of [0, 1, 2]) {
      let previous = 0;
      for (let t = 0; t <= 15; t += 0.25) {
        const now = timeline.progress(index, t);
        expect(now).toBeGreaterThanOrEqual(previous);
        previous = now;
      }
    }
  });

  it('draws the tracks in order', () => {
    const starts = timeline.windows!.map((w) => w.start);

    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});
