import { describe, expect, it } from 'vitest';
import {
  buildRoadGraph,
  mainNetwork,
  nearestNode,
  shortestPath,
  type LatLon,
  type RoadLine,
} from '../../src/demo/road-graph.ts';
import { clipToSquare } from '../../src/demo/tile-roads.ts';

/** A point this many meters east and north of 39.8 N, 3 E. */
const at = (east: number, north: number): LatLon => ({
  lat: 39.8 + north / 110_540,
  lon: 3 + east / (111_320 * Math.cos((39.8 * Math.PI) / 180)),
});
const road = (cls: string, ...points: [number, number][]): RoadLine => ({
  cls,
  points: points.map(([east, north]) => at(east, north)),
});
const anyRoad = () => 1;

describe('buildRoadGraph', () => {
  it('joins lines at shared and nearly shared points, but not where they only cross', () => {
    const graph = buildRoadGraph([
      road('minor', [0, 0], [100, 0]),
      // Starts 2 m from the first line's end: the same junction.
      road('minor', [102, 0], [150, 0], [200, 0]),
      // Ends 8 m short of the second line's middle point: joined to it.
      road('minor', [150, 100], [150, 8]),
      // Crosses the first line without a shared point, as a bridge would.
      road('secondary', [50, -50], [50, 50]),
    ]);
    const node = (east: number, north: number) =>
      nearestNode(graph, at(east, north), new Set(graph.nodes.keys()));

    expect(shortestPath(graph, node(0, 0), node(200, 0), anyRoad)).not.toBeNull();
    expect(shortestPath(graph, node(150, 100), node(0, 0), anyRoad)).not.toBeNull();
    expect(shortestPath(graph, node(50, 50), node(0, 0), anyRoad)).toBeNull();
  });

  it('keeps the largest network of the usable road classes', () => {
    const graph = buildRoadGraph([
      road('minor', [0, 0], [100, 0], [200, 0]),
      road('path', [200, 0], [300, 0]),
      road('minor', [1000, 0], [1100, 0]),
    ]);
    const all = mainNetwork(graph, () => true);
    const roads = mainNetwork(graph, (cls) => cls !== 'path');

    expect(all.size).toBe(4);
    expect(roads.size).toBe(3);
  });
});

describe('shortestPath', () => {
  it('prefers the cheaper road class over the shorter road', () => {
    // A straight primary road, and a detour on a secondary one.
    const graph = buildRoadGraph([
      road('primary', [0, 0], [1000, 0]),
      road('secondary', [0, 0], [500, 200], [1000, 0]),
    ]);
    const all = new Set(graph.nodes.keys());
    const [from, to] = [nearestNode(graph, at(0, 0), all), nearestNode(graph, at(1000, 0), all)];
    const via = (cost: (cls: string) => number) =>
      shortestPath(graph, from, to, cost)!.map((i) => graph.nodes[i]);

    expect(via(anyRoad)).toHaveLength(2);
    expect(via((cls) => (cls === 'primary' ? 1.6 : 1))).toHaveLength(3);
    expect(shortestPath(graph, from, to, () => Infinity)).toBeNull();
  });
});

describe('clipToSquare', () => {
  it('cuts lines exactly at the edges and drops the parts outside', () => {
    // In, out across the right edge, back in, and a segment wholly outside.
    const parts = clipToSquare([10, 10, 150, 10, 150, 50, 50, 50, -20, -20, -40, -20], 100);

    expect(parts).toEqual([
      [10, 10, 100, 10],
      [100, 50, 50, 50, 0, 0],
    ]);
  });
});
