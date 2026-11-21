// A road network built from map-tile road lines, and shortest paths through it. Used by the
// demo-routes script to draw made-up activities along real roads.

import { distanceM } from '@wornways/engine';

export type LatLon = { lat: number; lon: number };

/** One road line from the map: its class ("primary", "minor", "path"...) and points. */
export type RoadLine = { cls: string; points: LatLon[] };

type Edge = { to: number; metres: number; cls: string };

export type RoadGraph = {
  nodes: LatLon[];
  /** The edges leaving each node; every road can be used in both directions. */
  edges: Edge[][];
};

/** Points closer than this are one node: a junction drawn twice, or a line cut at a tile edge. */
const SNAP_M = 3;
/** A line that ends this close to another road is taken to join it. */
const JOIN_M = 12;

/**
 * Joins road lines into a graph. Points within `SNAP_M` of each other become one node, so
 * lines that share a junction, or that a map tile edge cut apart, connect. A line end that
 * still touches nothing joins the nearest node within `JOIN_M`, as map simplification can
 * move a junction a little. Lines only cross where they share a point, so bridges and
 * tunnels stay apart from the roads they pass over or under.
 */
export function buildRoadGraph(lines: RoadLine[]): RoadGraph {
  const nodes: LatLon[] = [];
  const edges: Edge[][] = [];
  // Nodes by grid cell of SNAP_M, to find a close one without searching them all.
  const cellOf = (p: LatLon) => {
    const perLon = 111_320 * Math.cos((p.lat * Math.PI) / 180);
    return [Math.floor((p.lat * 110_540) / SNAP_M), Math.floor((p.lon * perLon) / SNAP_M)];
  };
  const grid = new Map<string, number[]>();
  const near = (p: LatLon, radius: number, skip = -1): number => {
    const [row, col] = cellOf(p);
    const reach = Math.ceil(radius / SNAP_M);
    let best = -1;
    let bestM = radius;
    for (let r = row - reach; r <= row + reach; r++)
      for (let c = col - reach; c <= col + reach; c++)
        for (const i of grid.get(`${r}/${c}`) ?? []) {
          const m = distanceM(p.lat, p.lon, nodes[i].lat, nodes[i].lon);
          if (i !== skip && m <= bestM) {
            best = i;
            bestM = m;
          }
        }
    return best;
  };
  const nodeAt = (p: LatLon): number => {
    const found = near(p, SNAP_M);
    if (found >= 0) return found;
    nodes.push(p);
    edges.push([]);
    const [row, col] = cellOf(p);
    const key = `${row}/${col}`;
    const cell = grid.get(key) ?? [];
    cell.push(nodes.length - 1);
    grid.set(key, cell);
    return nodes.length - 1;
  };
  const connect = (a: number, b: number, cls: string) => {
    if (a === b || edges[a].some((e) => e.to === b)) return;
    const metres = distanceM(nodes[a].lat, nodes[a].lon, nodes[b].lat, nodes[b].lon);
    edges[a].push({ to: b, metres, cls });
    edges[b].push({ to: a, metres, cls });
  };

  const ends: { node: number; cls: string }[] = [];
  for (const line of lines) {
    let previous = -1;
    for (const point of line.points) {
      const node = nodeAt(point);
      if (previous >= 0) connect(previous, node, line.cls);
      previous = node;
    }
    if (line.points.length > 1)
      ends.push(
        { node: nodeAt(line.points[0]), cls: line.cls },
        { node: nodeAt(line.points[line.points.length - 1]), cls: line.cls },
      );
  }
  for (const { node, cls } of ends) {
    if (edges[node].length !== 1) continue; // already joined to more than its own line
    const own = edges[node][0].to;
    const other = near(nodes[node], JOIN_M, node);
    if (other >= 0 && other !== own) connect(node, other, cls);
  }
  return { nodes, edges };
}

/**
 * The largest set of nodes connected by roads of the classes `usable` accepts: the main
 * network, without islands such as a car park or a road cut off at the map's edge.
 */
export function mainNetwork(graph: RoadGraph, usable: (cls: string) => boolean): Set<number> {
  const seen = new Int32Array(graph.nodes.length).fill(-1);
  let best: number[] = [];
  for (let start = 0; start < graph.nodes.length; start++) {
    if (seen[start] >= 0) continue;
    const group = [start];
    seen[start] = start;
    for (let i = 0; i < group.length; i++)
      for (const { to, cls } of graph.edges[group[i]])
        if (seen[to] < 0 && usable(cls)) {
          seen[to] = start;
          group.push(to);
        }
    if (group.length > best.length) best = group;
  }
  return new Set(best);
}

/** The node of `allowed` nearest to a place. */
export function nearestNode(graph: RoadGraph, place: LatLon, allowed: Set<number>): number {
  let best = -1;
  let bestM = Infinity;
  for (const i of allowed) {
    const m = distanceM(place.lat, place.lon, graph.nodes[i].lat, graph.nodes[i].lon);
    if (m < bestM) {
      best = i;
      bestM = m;
    }
  }
  return best;
}

/**
 * The cheapest way from one node to another, as the nodes passed, or null when there is
 * none. An edge costs its length times `cost(class)`; an infinite cost rules a class out.
 */
export function shortestPath(
  graph: RoadGraph,
  from: number,
  to: number,
  cost: (cls: string) => number,
): number[] | null {
  const best = new Float64Array(graph.nodes.length).fill(Infinity);
  const previous = new Int32Array(graph.nodes.length).fill(-1);
  const heap = new MinHeap();
  best[from] = 0;
  heap.push(from, 0);
  while (heap.size > 0) {
    const [node, sofar] = heap.pop();
    if (node === to) break;
    if (sofar > best[node]) continue;
    for (const edge of graph.edges[node]) {
      const next = sofar + edge.metres * cost(edge.cls);
      if (next < best[edge.to]) {
        best[edge.to] = next;
        previous[edge.to] = node;
        heap.push(edge.to, next);
      }
    }
  }
  if (best[to] === Infinity) return null;
  const path = [to];
  while (path[path.length - 1] !== from) path.push(previous[path[path.length - 1]]);
  return path.reverse();
}

/** A binary heap of nodes by cost, cheapest first. */
class MinHeap {
  private readonly nodes: number[] = [];
  private readonly costs: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, cost: number): void {
    this.nodes.push(node);
    this.costs.push(cost);
    let i = this.nodes.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.costs[parent] <= this.costs[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): [node: number, cost: number] {
    const top: [number, number] = [this.nodes[0], this.costs[0]];
    const lastNode = this.nodes.pop()!;
    const lastCost = this.costs.pop()!;
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode;
      this.costs[0] = lastCost;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.nodes.length && this.costs[left] < this.costs[smallest]) smallest = left;
        if (right < this.nodes.length && this.costs[right] < this.costs[smallest]) smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.nodes[a], this.nodes[b]] = [this.nodes[b], this.nodes[a]];
    [this.costs[a], this.costs[b]] = [this.costs[b], this.costs[a]];
  }
}
