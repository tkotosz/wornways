import { describe, expect, it } from 'vitest';
import { followCamera, levelsFor, mapLevelWindows } from '../../src/replay/camera.ts';
import { followRouteCamera } from '../../src/replay/follow.ts';
import { chronologicalTimeline } from '../../src/replay/timeline.ts';
import { fitView } from '../../src/replay/view.ts';
import { STRIDE } from '../../src/track/types.ts';

/** A 30 km straight route heading east, one point every 10 s. */
function longRoute(lon = 19) {
  const count = 300;
  const points = new Float64Array(count * STRIDE);
  for (let i = 0; i < count; i++) points.set([lon + i * 0.0013, 47.5, 0, i * 10], i * STRIDE);
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

describe('followRouteCamera', () => {
  const fps = 30;

  it('pans with a moving route and settles on the fitted view', () => {
    const tracks = [longRoute()];
    const timeline = chronologicalTimeline([30_000], { duration: 20 });
    const view = fitView(tracks, 1080, 1920);
    const camera = followRouteCamera(tracks, timeline, view, fps);
    expect(camera.maxZoom).toBeGreaterThan(2);
    expect(camera.zoom[120]).toBe(camera.zoom[240]);
    expect(camera.tx[120]! - camera.tx[240]!).toBeGreaterThan(view.width / 2);
    expect([camera.zoom.at(-1), camera.tx.at(-1), camera.ty.at(-1)]).toEqual([1, 0, 0]);
  });

  it('widens for a distant activity and keeps each active map window in bounds', () => {
    const tracks = [longRoute(), longRoute(23)];
    const timeline = chronologicalTimeline([30_000, 30_000], { duration: 30, overlap: 0 });
    const view = fitView(tracks, 1080, 1920);
    const camera = followRouteCamera(tracks, timeline, view, fps);
    const transition = Math.ceil(timeline.windows![1]!.start * fps);
    expect(camera.zoom[transition]).toBeLessThan(camera.zoom[transition - 2 * fps]! / 2);
    expect(camera.zoom[transition]).toBeLessThan(camera.zoom[transition + 2 * fps]! / 2);

    const windows = mapLevelWindows(view, camera);
    expect(windows.some((level) => level.length > 1)).toBe(true);
    for (const level of windows)
      for (const { view: window } of level) {
        expect(window.width).toBeLessThan(2.3 * view.width);
        expect(window.height).toBeLessThan(2.3 * view.height);
      }
    for (let frame = 0; frame < camera.zoom.length; frame++) {
      const zoom = camera.zoom[frame]!;
      const [a, b] = levelsFor(zoom, windows.length - 1);
      for (const level of new Set([a, b])) {
        const window = windows[level]!.findLast((entry) => entry.from <= frame)!.view;
        const k = 2 ** level;
        const left = window.offX - view.offX * k - (camera.tx[frame]! * k) / zoom;
        const top = window.offY - view.offY * k - (camera.ty[frame]! * k) / zoom;
        expect(left).toBeGreaterThan(0);
        expect(top).toBeGreaterThan(0);
        expect(left + (view.width * k) / zoom).toBeLessThan(window.width);
        expect(top + (view.height * k) / zoom).toBeLessThan(window.height);
      }
    }
  });
});
