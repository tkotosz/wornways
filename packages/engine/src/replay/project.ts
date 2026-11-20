import { distanceM, mercatorX, mercatorY } from '../track/geo.ts';
import { STRIDE, type Track } from '../track/types.ts';
import type { View } from './view.ts';

/** A track in the pixel coordinates of a view. */
export type Projected = {
  /** [x, y] per point. */
  xy: Float32Array;
  /** Fraction of the track's (cleaned) duration reached at each point, 0..1. */
  u: Float64Array;
  /** Cumulative metres at each point. */
  dist: Float64Array;
  /** Cumulative metres climbed at each point; all zero when the track has no elevation. */
  climb: Float64Array;
  /** Whether the track recorded elevation. */
  hasElevation: boolean;
  count: number;
};

/** A rise or fall smaller than this, in metres, is taken for noise in the elevation. */
const CLIMB_STEP_M = 3;

/** Projects a track into `view`, dropping points closer than `minGapPx` to the one before. */
export function projectTrack(
  track: Pick<Track, 'points'>,
  view: View,
  minGapPx: number,
): Projected {
  const p = track.points;
  const n = p.length / STRIDE;
  const total = p[(n - 1) * STRIDE + 3];
  const xy: number[] = [];
  const u: number[] = [];
  const dist: number[] = [];
  const climb: number[] = [];
  let metres = 0;
  let climbed = 0;
  /** Elevation the next rise or fall is measured from; NaN until a point has elevation. */
  let level = NaN;
  for (let i = 0; i < n; i++) {
    const o = i * STRIDE;
    if (i > 0) metres += distanceM(p[o - STRIDE + 1], p[o - STRIDE], p[o + 1], p[o]);
    const ele = p[o + 2];
    if (Number.isFinite(ele)) {
      if (Number.isNaN(level)) level = ele;
      else if (ele - level >= CLIMB_STEP_M) {
        climbed += ele - level;
        level = ele;
      } else if (level - ele >= CLIMB_STEP_M) level = ele;
    }
    const x = mercatorX(p[o]) * view.scale + view.offX;
    const y = mercatorY(p[o + 1]) * view.scale + view.offY;
    const k = xy.length;
    if (i > 0 && i < n - 1 && Math.hypot(x - xy[k - 2], y - xy[k - 1]) < minGapPx) continue;
    xy.push(x, y);
    u.push(total > 0 ? p[o + 3] / total : i / (n - 1));
    dist.push(metres);
    climb.push(climbed);
  }
  return {
    xy: new Float32Array(xy),
    u: new Float64Array(u),
    dist: new Float64Array(dist),
    climb: new Float64Array(climb),
    hasElevation: !Number.isNaN(level),
    count: u.length,
  };
}
