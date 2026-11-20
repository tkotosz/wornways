import { describe, expect, it } from 'vitest';
import { tilesForView } from '../../src/map/basemap.ts';
import { projectTrack } from '../../src/replay/project.ts';
import { mercatorX, mercatorY } from '../../src/track/geo.ts';
import { STRIDE } from '../../src/track/types.ts';
import { fitView, trackArea } from '../../src/replay/view.ts';

/** A track through the given [lon, lat] points. */
function track(...lonLats: [number, number][]) {
  const points = new Float64Array(lonLats.length * STRIDE);
  lonLats.forEach(([lon, lat], i) => points.set([lon, lat, 0, i], i * STRIDE));
  return { points };
}

describe('fitView', () => {
  const tracks = [track([19.0, 47.5], [19.1, 47.55]), track([18.95, 47.45], [19.05, 47.6])];
  const view = fitView(tracks, 1080, 1920);
  const area = trackArea(1080, 1920);

  it('places every point inside the track area', () => {
    for (const { points } of tracks) {
      for (let i = 0; i < points.length; i += STRIDE) {
        const x = mercatorX(points[i]!) * view.scale + view.offX;
        const y = mercatorY(points[i + 1]!) * view.scale + view.offY;
        expect(x).toBeGreaterThanOrEqual(area.x - 0.001);
        expect(x).toBeLessThanOrEqual(area.x + area.w + 0.001);
        expect(y).toBeGreaterThanOrEqual(area.y - 0.001);
        expect(y).toBeLessThanOrEqual(area.y + area.h + 0.001);
      }
    }
  });

  it('refuses to fit when there are no points', () => {
    expect(() => fitView([], 1080, 1920)).toThrow('No points to fit');
  });

  it('fits a date-line route in one local view and asks for tiles on both sides', () => {
    const route = track([179.999, 0], [-179.999, 0]);
    const view = fitView([route], 640, 480);
    const projected = projectTrack(route, view, 0);
    expect(projected.dist.at(-1)).toBeCloseTo(222.64);
    expect(view.scale).toBeGreaterThan(1_000_000);
    expect(projected.xy[0]).toBeCloseTo(640 * 0.06);
    expect(projected.xy[2]).toBeCloseTo(640 * 0.94);
    expect(new Set(tilesForView(view).map(({ x }) => x))).toEqual(new Set([16_383, 16_384]));
  });
});
