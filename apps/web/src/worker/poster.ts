// The preview of a video: its last frame, the finished picture, or its ending, drawn at a
// small size.

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
import type { Poster, PosterScene } from '../messages.ts';
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

/**
 * Draws a still of the video the settings describe, at preview size, as a PNG: its last
 * frame, or for the ending the finished totals card over it when the video has one, else the
 * finished end card, else the last frame. With it come the widgets drawn, where each was
 * drawn on the last frame, and each value the video can show, for arranging them; for the
 * ending, also the totals card's widgets and values when it shows.
 */
export async function makePoster(
  library: Track[],
  input: SettingsInput,
  signal: AbortSignal,
  loadTiles: TileLoader = createTileLoader({ cache: cacheStorageTileCache }),
  scene: PosterScene = 'replay',
  /** Leave the widgets off the picture, for an editor that draws them over it itself. */
  bare = false,
): Promise<Poster> {
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
    hideWidgets: bare && scene === 'replay',
    hideTotalsWidgets: bare,
  });
  if (signal.aborted) throw new Canceled();

  const { renderer } = replay;
  const last = renderer.replayFrames - 1;
  renderer.skipTo(last);
  if (signal.aborted) throw new Canceled();
  renderer.renderFrame(last);
  const boxes = scene === 'replay' ? renderer.overlayBoxes() : { widgets: [] };
  // The totals card is for several activities only, as in the video.
  const totalsCard = scene === 'ending' && settings.totalsCard && selection.tracks.length > 1;
  if (totalsCard) renderer.drawFinishedCard('totals');
  else if (scene === 'ending' && settings.endCard) renderer.drawFinishedCard('end');
  const image = await (renderer.canvas as unknown as OffscreenCanvas).convertToBlob({
    type: 'image/png',
  });
  return {
    image,
    boxes,
    widgets: renderer.widgets,
    values: [...renderer.finalValues],
    profiles: renderer.profileShapes(120),
    totals: totalsCard
      ? (({ widgets, values }) => ({ widgets, values: [...values] }))(renderer.totalsCard())
      : null,
  };
}
