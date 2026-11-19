// The preview of a video: its last frame, the finished picture, drawn at a small size.

import {
  createTileLoader,
  parseSettings,
  prepareReplay,
  selectTracks,
  type CanvasLike,
  type SettingsInput,
  type TileLoader,
  type Track,
} from '@wornways/engine';
import { loadFont } from './font.ts';
import { cacheStorageTileCache } from './tile-cache.ts';
import { Canceled, VideoProblem, problemText } from './video.ts';

/** The preview's longer side, in pixels. */
const PREVIEW_LONG_SIDE = 480;

/** An even number of pixels near `n`, as video frame sizes need. */
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Draws the last frame of the video the settings describe, at preview size, as a PNG. */
export async function makePoster(
  library: Track[],
  input: SettingsInput,
  signal: AbortSignal,
  loadTiles: TileLoader = createTileLoader({ cache: cacheStorageTileCache }),
): Promise<Blob> {
  const settings = parseSettings(input);
  const selection = selectTracks(library, settings);
  if (selection.problem) throw new VideoProblem(problemText(selection.problem, settings));

  const scale = PREVIEW_LONG_SIDE / Math.max(settings.width, settings.height);
  const size = { width: even(settings.width * scale), height: even(settings.height * scale) };
  await loadFont();
  const replay = await prepareReplay(selection.tracks, settings, {
    createCanvas: (w, h) => new OffscreenCanvas(w, h) as unknown as CanvasLike,
    loadTiles,
    size,
  });
  if (signal.aborted) throw new Canceled();

  const { renderer } = replay;
  // The replay's last frame: the finished picture, not the end card after it.
  const last = renderer.replayFrames - 1;
  renderer.skipTo(last);
  if (signal.aborted) throw new Canceled();
  renderer.renderFrame(last);
  return (renderer.canvas as unknown as OffscreenCanvas).convertToBlob({ type: 'image/png' });
}
