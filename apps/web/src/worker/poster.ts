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

/** The preview's size for a frame of this size: the same shape, the longer side 480 pixels. */
export function previewSize(frame: { width: number; height: number }) {
  const scale = PREVIEW_LONG_SIDE / Math.max(frame.width, frame.height);
  return { width: even(frame.width * scale), height: even(frame.height * scale) };
}

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

  const size = previewSize(settings);
  await loadFont();
  const replay = await prepareReplay(selection.tracks, settings, {
    createCanvas: (w, h) => new OffscreenCanvas(w, h) as unknown as CanvasLike,
    loadTiles,
    signal,
    size,
    // The replay's last frame: the finished picture, not the end card after it.
    lastFrameOnly: true,
  });
  if (signal.aborted) throw new Canceled();

  const { renderer } = replay;
  const last = renderer.replayFrames - 1;
  renderer.skipTo(last);
  if (signal.aborted) throw new Canceled();
  renderer.renderFrame(last);
  return (renderer.canvas as unknown as OffscreenCanvas).convertToBlob({ type: 'image/png' });
}
