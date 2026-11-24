// Builds the web app's demo activities: made-up rides and runs along real roads in
// Mallorca, written as a Strava-style export to apps/web/public/demo/mallorca.zip.
// Run with `npm run demo-routes`. The same map data always gives the same file.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createTileLoader, distanceM, type TileId } from '@wornways/engine';
import { fileTileCache, tileCacheDir } from '../tiles.ts';
import { HOME, MONTH_RUNS, RIDE_COST, RIDES, RUN_COST, type DemoActivity } from './mallorca.ts';
import {
  buildRoadGraph,
  mainNetwork,
  nearestNode,
  shortestPath,
  type LatLon,
  type RoadGraph,
} from './road-graph.ts';
import { alongRoute, loadTerrain, routeHeights, TERRAIN_ZOOM } from './terrain.ts';
import { tileRoads } from './tile-roads.ts';
import { recordRoute, RIDE_HILLS, RUN_HILLS, seededRandom, type Recorded } from './timing.ts';
import { activitiesCsv, gpxFile, type ListedActivity, zipFile } from './writers.ts';

const OUT = path.join(import.meta.dirname, '../../../web/public/demo/mallorca.zip');
/** Zoom 13 still has every road and path, in about 600 tiles for the island. */
const ZOOM = 13;
const AREA = { west: 2.3, east: 3.48, north: 39.97, south: 39.26 };
/** OpenFreeMap allows offline downloads of at most 3,000 tiles at a time. */
const MAX_TILES = 3000;
const USER_AGENT = 'wornways-demo-routes/0.0';

const README = `Wornways demo activities

Made-up rides and runs on real roads in Mallorca, for trying Wornways without your own
activities. The routes were drawn along roads from OpenStreetMap data, (c) OpenStreetMap
contributors, available under the Open Database License (ODbL) 1.0:
https://opendatacommons.org/licenses/odbl/1-0/
The road data came from OpenMapTiles vector tiles served by OpenFreeMap.

The heights come from Terrain Tiles (https://registry.opendata.aws/terrain-tiles/):
SRTM terrain data courtesy of the U.S. Geological Survey, and ETOPO1 terrain data from
the U.S. National Oceanic and Atmospheric Administration.
`;

/** The map tiles covering the island. */
function tileIds(): TileId[] {
  const n = 2 ** ZOOM;
  const x = (lon: number) => Math.floor(((lon + 180) / 360) * n);
  const y = (lat: number) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n);
  };
  const ids: TileId[] = [];
  for (let tx = x(AREA.west); tx <= x(AREA.east); tx++)
    for (let ty = y(AREA.north); ty <= y(AREA.south); ty++) ids.push({ z: ZOOM, x: tx, y: ty });
  return ids;
}

const costOf = (table: Record<string, number>) => (cls: string) => table[cls] ?? Infinity;
const lengthM = (route: LatLon[]) =>
  route
    .slice(1)
    .reduce((sum, p, i) => sum + distanceM(route[i].lat, route[i].lon, p.lat, p.lon), 0);

/** The route through the places, along the cheapest roads; fails when a place is cut off. */
function routeVia(
  graph: RoadGraph,
  network: Set<number>,
  cost: (cls: string) => number,
  via: LatLon[],
): LatLon[] {
  const stops = via.map((p) => nearestNode(graph, p, network));
  const nodes: number[] = [stops[0]];
  for (let i = 1; i < stops.length; i++) {
    const leg = shortestPath(graph, stops[i - 1], stops[i], cost);
    if (!leg)
      throw new Error(`no road from ${JSON.stringify(via[i - 1])} to ${JSON.stringify(via[i])}`);
    nodes.push(...leg.slice(1));
  }
  return nodes.map((i) => graph.nodes[i]);
}

/** A run of about `km` from home: out to two points and back, picked at random. */
function runLoop(
  graph: RoadGraph,
  network: Set<number>,
  km: number,
  random: () => number,
): LatLon[] {
  const cost = costOf(RUN_COST);
  let best: LatLon[] = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    const reach = (km * 1000) / 3.4;
    const angle = random() * 2 * Math.PI;
    const turn = (random() < 0.5 ? 1 : -1) * (Math.PI / 3);
    const point = (a: number): LatLon => ({
      lat: HOME.lat + (reach * Math.sin(a)) / 110_540,
      lon: HOME.lon + (reach * Math.cos(a)) / (111_320 * Math.cos((HOME.lat * Math.PI) / 180)),
    });
    const route = routeVia(graph, network, cost, [HOME, point(angle), point(angle + turn), HOME]);
    const off = Math.abs(lengthM(route) / 1000 - km);
    if (off < Math.abs(lengthM(best) / 1000 - km) || best.length === 0) best = route;
    if (off <= km * 0.15) break;
  }
  return best;
}

async function main(): Promise<void> {
  const ids = tileIds();
  if (ids.length > MAX_TILES) throw new Error(`${ids.length} tiles is over the download limit`);
  const load = createTileLoader({ cache: fileTileCache(tileCacheDir()), userAgent: USER_AGENT });
  const { tiles, downloaded } = await load(ids);
  console.log(`Map        ${tiles.length} tiles at zoom ${ZOOM} (${downloaded} downloaded)`);

  const graph = buildRoadGraph(
    tileRoads(tiles, (cls) => Object.hasOwn(RIDE_COST, cls) || Object.hasOwn(RUN_COST, cls)),
  );
  const rideNetwork = mainNetwork(graph, (cls) => Object.hasOwn(RIDE_COST, cls));
  const runNetwork = mainNetwork(graph, (cls) => Object.hasOwn(RUN_COST, cls));
  console.log(
    `Roads      ${graph.nodes.length} junctions and bends; ${rideNetwork.size} on the ride network, ${runNetwork.size} on the run network`,
  );

  const random = seededRandom(2026);
  const planned: (DemoActivity & { route: LatLon[] })[] = [
    ...RIDES.map((ride) => ({
      ...ride,
      route: routeVia(graph, rideNetwork, costOf(RIDE_COST), ride.via),
    })),
    ...MONTH_RUNS.map((run) => ({
      name: run.name,
      sport: 'run' as const,
      start: run.start,
      via: [],
      route: runLoop(graph, runNetwork, run.km, random),
    })),
  ].sort((a, b) => a.start.localeCompare(b.start));

  // Heights: read every 20 m along each route, from the terrain tiles those places are on.
  const places = planned.map((activity) => alongRoute(activity.route));
  // Beside the map tiles' folder, not in it: that one is emptied when the map changes.
  const terrainDir = path.join(path.dirname(tileCacheDir()), 'terrain');
  const terrain = await loadTerrain(places.flat(), fileTileCache(terrainDir), USER_AGENT);
  console.log(
    `Terrain    ${terrain.tiles} tiles at zoom ${TERRAIN_ZOOM} (${terrain.downloaded} downloaded)`,
  );

  const files: { path: string; data: Uint8Array }[] = [];
  const listed: ListedActivity[] = [];
  const encoder = new TextEncoder();
  for (const [i, activity] of planned.entries()) {
    const km = lengthM(activity.route) / 1000;
    const ride = activity.sport === 'ride';
    const points: Recorded[] = recordRoute(
      activity.route,
      {
        // Rides between 23 and 27 km/h, runs between 10.5 and 11.5 km/h.
        speed: ride ? (23 + 4 * random()) / 3.6 : (10.5 + random()) / 3.6,
        interval: 10,
        hills: {
          heights: routeHeights(places[i], terrain.heightAt),
          pace: ride ? RIDE_HILLS : RUN_HILLS,
        },
        stop: ride && km > 60 ? { at: 0.55, seconds: 900 + Math.round(600 * random()) } : undefined,
      },
      random,
    );
    const id = `mallorca-${String(i + 1).padStart(2, '0')}`;
    const file = `activities/${id}.gpx`;
    const start = new Date(activity.start);
    const type = ride ? 'Ride' : 'Run';
    files.push({
      path: file,
      data: encoder.encode(gpxFile(activity.name, ride ? 'cycling' : 'running', start, points)),
    });
    listed.push({
      id,
      start,
      name: activity.name,
      type,
      seconds: points[points.length - 1].seconds,
      file,
    });
    const hours = points[points.length - 1].seconds / 3600;
    const climbed = points
      .slice(1)
      .reduce((sum, p, k) => sum + Math.max(0, p.ele! - points[k].ele!), 0);
    console.log(
      `  ${id}  ${activity.start.slice(0, 10)}  ${type.padEnd(4)}  ${km.toFixed(1).padStart(5)} km  ${hours.toFixed(1)} h  ↑${climbed.toFixed(0).padStart(4)} m  ${activity.name}`,
    );
  }
  files.unshift(
    { path: 'README.txt', data: encoder.encode(README) },
    { path: 'activities.csv', data: encoder.encode(activitiesCsv(listed)) },
  );
  const zip = zipFile(files);
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, zip);
  console.log(
    `Written    ${path.relative(process.cwd(), OUT)} (${(zip.length / 1024).toFixed(0)} KB)`,
  );
}

await main();
