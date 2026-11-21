// The road lines of map tiles, in latitude and longitude, for building a road network.

import { MVT_LINE, decodeMvt, type Tile } from '@wornways/engine';
import type { LatLon, RoadLine } from './road-graph.ts';

/**
 * The parts of a line inside the square from 0 to `extent`, cut exactly at its edges. A
 * tile also carries a margin of each road beyond its edges, simplified on its own: two
 * neighbours' margins share no points, so a road joins across the edge only when both
 * tiles' halves end right on it.
 */
export function clipToSquare(line: number[], extent: number): number[][] {
  const parts: number[][] = [];
  let part: number[] = [];
  for (let i = 0; i + 3 < line.length; i += 2) {
    let [x0, y0, x1, y1] = [line[i], line[i + 1], line[i + 2], line[i + 3]];
    // Liang-Barsky: the share of the segment, from t0 to t1, that lies inside.
    let t0 = 0;
    let t1 = 1;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const inside = [
      [-dx, x0],
      [dx, extent - x0],
      [-dy, y0],
      [dy, extent - y0],
    ].every(([p, q]) => {
      if (p === 0) return q >= 0;
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      return t0 <= t1;
    });
    if (!inside) {
      if (part.length) parts.push(part);
      part = [];
      continue;
    }
    [x0, y0, x1, y1] = [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
    const last = part.length;
    if (last && (part[last - 2] !== x0 || part[last - 1] !== y0)) {
      parts.push(part);
      part = [];
    }
    if (!part.length) part.push(x0, y0);
    part.push(x1, y1);
    // A segment that leaves the square ends this part.
    if (t1 < 1) {
      parts.push(part);
      part = [];
    }
  }
  if (part.length) parts.push(part);
  return parts.filter((p) => p.length >= 4);
}

/** The lines of the tiles' transportation layer whose class `wanted` accepts. */
export function tileRoads(tiles: Tile[], wanted: (cls: string) => boolean): RoadLine[] {
  const lines: RoadLine[] = [];
  for (const tile of tiles) {
    if (!tile.data) continue;
    const layer = decodeMvt(tile.data, new Set(['transportation'])).get('transportation');
    if (!layer) continue;
    const n = 2 ** tile.z;
    const toLatLon = (px: number, py: number): LatLon => {
      const mx = (tile.x + px / layer.extent) / n;
      const my = (tile.y + py / layer.extent) / n;
      return {
        lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI,
        lon: mx * 360 - 180,
      };
    };
    for (const feature of layer.features) {
      const cls = String(feature.props.class);
      if (feature.type !== MVT_LINE || !wanted(cls)) continue;
      for (const line of feature.geometry)
        for (const part of clipToSquare(line, layer.extent)) {
          const points: LatLon[] = [];
          for (let i = 0; i < part.length; i += 2) points.push(toLatLon(part[i], part[i + 1]));
          lines.push({ cls, points });
        }
    }
  }
  return lines;
}
