import { decodeMvt, MVT_LINE, MVT_POINT, MVT_POLYGON, type MvtFeature } from './mvt.ts';
import type { Context2DLike } from '../replay/render.ts';
import type { View } from '../replay/view.ts';

// Draws a dark street map from vector tiles in the OpenMapTiles schema
// (https://openmaptiles.org/schema/). The engine never fetches tiles itself: the host
// asks `tilesForView` which tiles are needed and hands their bytes back.

export type TileId = { z: number; x: number; y: number };
/** `data` is the uncompressed tile, or null where the source has no tile (open ocean). */
export type Tile = TileId & { data: Uint8Array | null };

/** The map at one zoom level: the canvas-sized view it is drawn in and the tiles covering it. */
export type MapLevel = { view: View; tiles: Tile[] };

export type Basemap = {
  /** From `mapLevelViews`: a single level for a fixed camera, several for a moving one. */
  levels: MapLevel[];
  /** Plain-text credit drawn in the corner of every frame. Required by the data licence. */
  attribution: string;
};

export type MapLabel = { x: number; y: number; text: string; size: number };

/** Tiles covering the whole frame, at the zoom whose level of detail suits the view. */
export function tilesForView(view: View, maxZoom = 14, maxTiles = 80): TileId[] {
  // A vector tile is designed to be shown around 512 px wide; pick the zoom that makes
  // tiles at most that large on screen, so the map has slightly more detail than less.
  let z = Math.min(maxZoom, Math.max(0, Math.ceil(Math.log2(view.scale / 512))));
  for (;;) {
    const n = 2 ** z;
    const clampIndex = (v: number, count = n) =>
      Math.min(count - 1, Math.max(0, Math.floor(v * n)));
    const columns = view.wrapLongitude ? 2 * n : n;
    const x0 = clampIndex(-view.offX / view.scale, columns);
    const x1 = clampIndex((view.width - view.offX) / view.scale, columns);
    const y0 = clampIndex(-view.offY / view.scale);
    const y1 = clampIndex((view.height - view.offY) / view.scale);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= maxTiles || z === 0) {
      const ids: TileId[] = [];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ids.push({ z, x, y });
      return ids;
    }
    z--;
  }
}

// Every colour is opaque: tile geometry overlaps its neighbours by a small buffer, and
// opaque paint hides that overlap where translucent paint would show it as seams.
const FILLS = {
  residential: '#0f1219',
  wood: '#0b1511',
  water: '#0c1a2c',
};
const WATERWAY = { color: '#0c1a2c', river: 2.2, stream: 1 };
/** Drawn in this order, so major roads end up on top. Widths are in 1080p pixels. */
const ROADS: { classes: string[]; color: string; width: number }[] = [
  { classes: ['rail', 'transit'], color: '#1f2530', width: 0.9 },
  { classes: ['service', 'track', 'path'], color: '#1b1f27', width: 0.7 },
  { classes: ['minor'], color: '#252a34', width: 0.9 },
  { classes: ['tertiary'], color: '#2e3440', width: 1.2 },
  { classes: ['secondary'], color: '#373e4b', width: 1.5 },
  { classes: ['primary', 'trunk'], color: '#424a59', width: 1.9 },
  { classes: ['motorway'], color: '#4d5667', width: 2.4 },
];
const RESIDENTIAL = new Set([
  'residential',
  'suburb',
  'neighbourhood',
  'commercial',
  'industrial',
  'retail',
]);
const PLACE_SIZE: Record<string, number> = {
  city: 30,
  town: 25,
  village: 20,
  suburb: 18,
  hamlet: 17,
};
const PLACE_ORDER = ['city', 'town', 'village', 'suburb', 'hamlet'];
const LAYERS = new Set(['landuse', 'landcover', 'water', 'waterway', 'transportation', 'place']);

/**
 * Paints land, water and roads onto `ctx` and returns the place names found, most
 * important first, for the caller to lay out and draw on top of the heatmap.
 * `unit` is the frame's scale relative to 1080p.
 */
export function drawBasemap(
  ctx: Context2DLike,
  view: View,
  tiles: Tile[],
  unit: number,
): MapLabel[] {
  type Decoded = {
    features: Map<string, MvtFeature[]>;
    toX: (v: number) => number;
    toY: (v: number) => number;
  };
  const decoded: Decoded[] = [];
  let zoom = 0;
  for (const tile of tiles) {
    if (!tile.data) continue;
    zoom = tile.z;
    const layers = decodeMvt(tile.data, LAYERS);
    const world = 1 / 2 ** tile.z;
    const features = new Map<string, MvtFeature[]>();
    let extent = 4096;
    for (const [name, layer] of layers) {
      features.set(name, layer.features);
      extent = layer.extent;
    }
    const k = (world / extent) * view.scale;
    decoded.push({
      features,
      toX: (v) => tile.x * world * view.scale + view.offX + v * k,
      toY: (v) => tile.y * world * view.scale + view.offY + v * k,
    });
  }

  /** Adds the outlines of all matching features, from every tile, to the current path. */
  function trace(layer: string, type: number, match: (f: MvtFeature) => boolean): void {
    ctx.beginPath();
    for (const tile of decoded) {
      for (const f of tile.features.get(layer) ?? []) {
        if (f.type !== type || !match(f)) continue;
        for (const part of f.geometry) {
          ctx.moveTo(tile.toX(part[0]), tile.toY(part[1]));
          for (let i = 2; i < part.length; i += 2)
            ctx.lineTo(tile.toX(part[i]), tile.toY(part[i + 1]));
        }
      }
    }
  }
  const fill = (color: string) => {
    ctx.fillStyle = color;
    ctx.fill();
  };
  const stroke = (color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width * unit;
    ctx.stroke();
  };

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  trace('landuse', MVT_POLYGON, (f) => RESIDENTIAL.has(String(f.props.class)));
  fill(FILLS.residential);
  trace('landcover', MVT_POLYGON, (f) => f.props.class === 'wood');
  fill(FILLS.wood);
  trace('waterway', MVT_LINE, (f) => f.props.class !== 'river' && f.props.class !== 'canal');
  stroke(WATERWAY.color, WATERWAY.stream);
  trace('waterway', MVT_LINE, (f) => f.props.class === 'river' || f.props.class === 'canal');
  stroke(WATERWAY.color, WATERWAY.river);
  trace('water', MVT_POLYGON, () => true);
  fill(FILLS.water);
  for (const road of ROADS) {
    trace('transportation', MVT_LINE, (f) => road.classes.includes(String(f.props.class)));
    stroke(road.color, road.width);
  }

  // Place names. Smaller places only once the view is zoomed in enough to have room.
  const allowed = PLACE_ORDER.slice(0, zoom >= 12 ? 5 : zoom >= 10 ? 3 : 2);
  const places: (MapLabel & { order: number })[] = [];
  const seen = new Set<string>();
  for (const tile of decoded) {
    for (const f of tile.features.get('place') ?? []) {
      const cls = String(f.props.class);
      const name = f.props['name:latin'] ?? f.props.name;
      if (
        f.type !== MVT_POINT ||
        !allowed.includes(cls) ||
        typeof name !== 'string' ||
        seen.has(name)
      )
        continue;
      const x = tile.toX(f.geometry[0][0]);
      const y = tile.toY(f.geometry[0][1]);
      if (x < 0 || y < 0 || x > view.width || y > view.height) continue;
      seen.add(name);
      const rank = typeof f.props.rank === 'number' ? f.props.rank : 99;
      places.push({
        x,
        y,
        text: name,
        size: PLACE_SIZE[cls] * unit,
        order: PLACE_ORDER.indexOf(cls) * 100 + rank,
      });
    }
  }
  return places
    .sort((a, b) => a.order - b.order)
    .map(({ x, y, text, size }) => ({ x, y, text, size }));
}
