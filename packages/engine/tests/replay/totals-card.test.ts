import { describe, expect, it } from 'vitest';
import { movingSeconds } from '../../src/replay/totals-card.ts';
import { STRIDE } from '../../src/track/types.ts';

/** A track heading east: a point every 10 s, each `stepDeg` of longitude after the one before. */
function track(steps: number[]) {
  const points = new Float64Array((steps.length + 1) * STRIDE);
  let lon = 19;
  points.set([lon, 47.5, 0, 0], 0);
  steps.forEach((step, i) => {
    lon += step;
    points.set([lon, 47.5, 0, (i + 1) * 10], (i + 1) * STRIDE);
  });
  return { points };
}

describe('movingSeconds', () => {
  it('counts the time between points covered at walking speed or faster', () => {
    // 0.0004° of longitude is about 30 m: 3 m/s. Standing still in between does not count.
    expect(movingSeconds(track([0.0004, 0.0004, 0, 0, 0.0004]))).toBe(30);
  });

  it('leaves out creeping slower than half a meter a second', () => {
    // About 2 m in 10 s.
    expect(movingSeconds(track([0.00003, 0.00003]))).toBe(0);
  });
});
