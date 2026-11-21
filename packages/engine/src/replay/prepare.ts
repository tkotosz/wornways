// Setting up a replay for the chosen tracks and settings: pacing, title, camera, map and
// the renderer that draws its frames. Front ends then draw the frames in order and hand
// them to their video encoder or to the screen.

import { tilesForView, type Basemap, type MapLevel, type TileId } from '../map/basemap.ts';
import { MAP_ATTRIBUTION, MAX_TILE_ZOOM, type TileLoader } from '../map/tiles.ts';
import type { Track } from '../track/types.ts';
import { followCamera, mapLevelViews, mapLevelWindows, type CameraPath } from './camera.ts';
import { followRouteCamera } from './follow.ts';
import { automaticTitle, planReplay, type ReplayPlan } from './plans.ts';
import { createRenderer, type CanvasFactory, type Renderer, type RenderOptions } from './render.ts';
import type { RenderSettings } from './settings.ts';
import { fitView } from './view.ts';

export type ReplayParts = {
  /** Draws the frames, in order from 0. */
  renderer: Renderer;
  plan: ReplayPlan;
  /** The title drawn at the top; empty for none. */
  title: string;
  width: number;
  height: number;
  fps: number;
  /** The moving camera; undefined for a fixed one. */
  camera: CameraPath | undefined;
  /** The camera in use: the follow camera falls back to zoom where it cannot follow. */
  cameraMode: RenderSettings['camera'];
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
  signal?: AbortSignal;
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
  options.signal?.throwIfAborted();
  const { width, height } = options.size ?? settings;
  const { fps } = settings;
  const single = tracks.length === 1 ? tracks[0] : null;

  const plan = planReplay(tracks, settings);
  const title = settings.title ?? automaticTitle(tracks, settings);
  const view = fitView(tracks, width, height);
  const cameraMode = plan.camera;
  const camera =
    cameraMode === 'follow'
      ? followRouteCamera(tracks, plan.timeline, view, fps)
      : cameraMode === 'zoom'
        ? followCamera(tracks, plan.timeline, view, { fps })
        : undefined;
  let levelWindows: RenderOptions['levelWindows'];
  if (cameraMode === 'follow') levelWindows = { levels: mapLevelWindows(view, camera!) };

  let basemap: Basemap | undefined;
  let map: MapReport | null = null;
  if (settings.map) {
    map = { tiles: 0, downloaded: 0, zooms: [], error: null };
    try {
      if (levelWindows) {
        const key = ({ z, x, y }: TileId) => `${z}/${x}/${y}`;
        const windows = levelWindows.levels.flat();
        const ids = windows.map((window) => tilesForView(window.view, MAX_TILE_ZOOM));
        const unique = new Map(ids.flat().map((id) => [key(id), id]));
        const loaded = await options.loadTiles([...unique.values()], options.signal);
        const byId = new Map(loaded.tiles.map((tile) => [key(tile), tile]));
        windows.forEach((window, i) => {
          window.tiles = ids[i].map((id) => byId.get(key(id)) ?? { ...id, data: null });
        });
        levelWindows.attribution = MAP_ATTRIBUTION;
        map.tiles = unique.size;
        map.downloaded = loaded.downloaded;
        map.zooms = [...new Set([...unique.values()].map((id) => id.z))];
      } else {
        const levels: MapLevel[] = [];
        for (const levelView of mapLevelViews(view, camera)) {
          const ids = tilesForView(levelView, MAX_TILE_ZOOM);
          const loaded = await options.loadTiles(ids, options.signal);
          levels.push({ view: levelView, tiles: loaded.tiles });
          map.tiles += ids.length;
          map.downloaded += loaded.downloaded;
          map.zooms.push(ids[0].z);
        }
        basemap = { levels, attribution: MAP_ATTRIBUTION };
      }
    } catch (err) {
      map.error = err instanceof Error ? err.message : String(err);
    }
  }
  options.signal?.throwIfAborted();

  const sport = tracks[0].sport;
  const words = sportWords(tracks.every((track) => track.sport === sport) ? sport : null);
  const renderer = createRenderer(tracks, plan.timeline, options.createCanvas, {
    view,
    camera,
    preserveRoutePoints: settings.trimRadius > 0,
    basemap,
    levelWindows,
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
  return { renderer, plan, title, width, height, fps, camera, cameraMode, map };
}
