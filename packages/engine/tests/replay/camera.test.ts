import { describe, expect, it } from 'vitest';
import { followCamera } from '../../src/replay/camera.ts';
import { chronologicalTimeline } from '../../src/replay/timeline.ts';
import { fitView } from '../../src/replay/view.ts';
import { STRIDE } from '../../src/track/types.ts';

/** A 30 km straight route heading east, one point every 10 s. */
function longRoute() {
  const count = 300;
  const points = new Float64Array(count * STRIDE);
  for (let i = 0; i < count; i++) points.set([19 + i * 0.0013, 47.5, 0, i * 10], i * STRIDE);
  return { points };
}

describe('followCamera', () => {
  const tracks = [longRoute()];
  const timeline = chronologicalTimeline([30_000], { duration: 10 });
  const camera = followCamera(tracks, timeline, fitView(tracks, 1080, 1920), { fps: 30 });
  const zoom = Array.from(camera.zoom);

  it('has one position per frame', () => {
    expect(zoom).toHaveLength(300);
  });

  it('starts close and ends on the whole route', () => {
    expect(zoom[0]).toBeGreaterThan(2);
    expect(zoom.at(-1)).toBeCloseTo(1, 2);
  });

  it('only ever pulls back', () => {
    for (let f = 1; f < zoom.length; f++) expect(zoom[f]).toBeLessThanOrEqual(zoom[f - 1]! + 1e-6);
  });
});
