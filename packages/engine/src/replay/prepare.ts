// Setting up a replay for the chosen tracks and settings: pacing, title, camera, map and
// the renderer that draws its frames. Front ends then draw the frames in order and hand
// them to their video encoder or to the screen.

import { tilesForView, type Basemap, type MapLevel } from '../map/basemap.ts';
import { MAP_ATTRIBUTION, MAX_TILE_ZOOM, type TileLoader } from '../map/tiles.ts';
import type { Track } from '../track/types.ts';
import { followCamera, mapLevelViews, type CameraPath } from './camera.ts';
import { automaticTitle, planReplay, type Plan } from './plans.ts';
import { createRenderer, type CanvasFactory, type Renderer } from './render.ts';
import type { RenderSettings } from './settings.ts';
import { fitView } from './view.ts';

export type ReplayParts = {
  /** Draws the frames, in order from 0. */
  renderer: Renderer;
  plan: Plan;
  /** The title drawn at the top; empty for none. */
  title: string;
  width: number;
  height: number;
  fps: number;
  /** The moving camera; undefined for a fixed one. */
  camera: CameraPath | undefined;
  /** What was loaded for the map; null when the settings leave the map out. */
  map: MapReport | null;
};

export type MapReport = {
  /** How many tiles the map uses, and how many of them had to be downloaded. */
  tiles: number;
  downloaded: number;
  /** The zoom level of each map level, from the widest view to the closest. */
  zooms: number[];
  /** Why the map could not be loaded; the replay is drawn without it. Null when it was. */
  error: string | null;
};

export type PrepareOptions = {
  createCanvas: CanvasFactory;
  loadTiles: TileLoader;
  /** Draw at this size instead of the settings' frame size, e.g. for a smaller preview. */
  size?: { width: number; height: number };
};

/** Nouns for the counter and the verb for activities under way, by the one sport shown. */
function sportWords(sport: string | null) {
  if (sport === 'ride') return { count: ['ride', 'rides'] as [string, string], moving: 'riding' };
  if (sport === 'run') return { count: ['run', 'runs'] as [string, string], moving: 'running' };
  return { count: ['activity', 'activities'] as [string, string], moving: 'moving' };
}

/** Sets up the replay of `tracks` (cleaned, in date order) with the given settings. */
export async function prepareReplay(
  tracks: Track[],
  settings: RenderSettings,
  options: PrepareOptions,
): Promise<ReplayParts> {
  if (tracks.length === 0) throw new Error('No tracks to replay');
  const { width, height } = options.size ?? settings;
  const { fps } = settings;
  const single = tracks.length === 1 ? tracks[0] : null;

  const plan = planReplay(tracks, settings);
  const title = settings.title ?? automaticTitle(tracks, settings);
  const view = fitView(tracks, width, height);
  const camera =
    settings.camera === 'zoom' ? followCamera(tracks, plan.timeline, view, { fps }) : undefined;

  let basemap: Basemap | undefined;
  let map: MapReport | null = null;
  if (settings.map) {
    map = { tiles: 0, downloaded: 0, zooms: [], error: null };
    try {
      const levels: MapLevel[] = [];
      for (const levelView of mapLevelViews(view, camera)) {
        const ids = tilesForView(levelView, MAX_TILE_ZOOM);
        const loaded = await options.loadTiles(ids);
        levels.push({ view: levelView, tiles: loaded.tiles });
        map.tiles += ids.length;
        map.downloaded += loaded.downloaded;
        map.zooms.push(ids[0].z);
      }
      basemap = { levels, attribution: MAP_ATTRIBUTION };
    } catch (err) {
      map.error = err instanceof Error ? err.message : String(err);
    }
  }

  const shownSports = settings.sports ?? (single ? [single.sport] : null);
  const words = sportWords(shownSports?.length === 1 ? shownSports[0] : null);
  const renderer = createRenderer(tracks, plan.timeline, options.createCanvas, {
    view,
    camera,
    basemap,
    width,
    height,
    fps,
    title: title || undefined,
    countLabel: words.count,
    movingLabel: words.moving,
    overlay: single ? 'single' : undefined,
    metrics: settings.metrics ? (settings.metricsFields ?? undefined) : [],
    metricsPosition: settings.metricsPosition,
    // Text already scales with the frame size; these are the settings on top.
    titlePosition: settings.titlePosition,
    titleScale: settings.titleSize / 100,
    metricsScale: settings.metricsSize / 100,
    endCard: settings.endCard,
    watermark: settings.watermark,
  });
  return { renderer, plan, title, width, height, fps, camera, map };
}
