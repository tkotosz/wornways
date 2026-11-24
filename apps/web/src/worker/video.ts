// Making a video in the worker: choosing the activities, setting up the replay, drawing
// every frame on an OffscreenCanvas and encoding it to an H.264 MP4 with the browser's
// encoder (WebCodecs), through Mediabunny. A draft is the same video at the preview's size
// and a lower frame rate, to play on the page before the real one is made.

import {
  createTileLoader,
  nearPlacesText,
  parseSettings,
  prepareReplay,
  selectTracks,
  videoFileName,
  type CanvasLike,
  type RenderSettings,
  type SelectionProblem,
  type SettingsInput,
  type TileLoader,
  type Track,
} from '@wornways/engine';
import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeVideo,
} from 'mediabunny';
import type { Progress, VideoReport } from '../messages.ts';
import { loadFont } from './font.ts';
import { previewSize } from './poster.ts';
import { cacheStorageTileCache } from './tile-cache.ts';

/** Bits per second for a 1080x1920 video at 30 frames per second; other sizes scale with it. */
const FULL_HD_BITRATE = 8_000_000;

/** A draft's frame rate: enough to see how the routes move, at half the frames of 30 fps. */
export const DRAFT_FPS = 15;
/** A draft's bits per second: its frames are small, but the map's lines need some detail. */
const DRAFT_BITRATE = 1_500_000;

/** What went wrong in choosing the activities, in words for the person. */
export function problemText(problem: SelectionProblem, settings: RenderSettings): string {
  if (problem === 'nothing-matches') return 'No activity matches the settings.';
  if (problem === 'nothing-near') return `None of the activities ${nearPlacesText(settings)}.`;
  if (problem === 'nothing-after-trim')
    return 'No usable route remains. Reduce the trim radius to make this video.';
  return 'The chosen activities have no usable route.';
}

/** A problem the person can fix; its message is shown as it is. */
export class VideoProblem extends Error {}

export class Canceled extends Error {}

/**
 * Makes the canvases of a video, and tells when one of them loses its content. A browser
 * keeps canvases on the GPU; when the GPU restarts they come back empty, and the encoder
 * never takes the next frame. `lost` then fails, so the video can end with a message
 * instead of waiting forever.
 */
function watchedCanvases() {
  let fail: (problem: VideoProblem) => void = () => {};
  const lost = new Promise<never>((_, reject) => (fail = reject));
  // Only ever waited for in a race with the work in progress.
  lost.catch(() => {});
  const createCanvas = (width: number, height: number) => {
    const canvas = new OffscreenCanvas(width, height);
    canvas.addEventListener('contextlost', () =>
      fail(
        new VideoProblem(
          'The graphics of this device restarted while the video was being made. Make the video again.',
        ),
      ),
    );
    return canvas as unknown as CanvasLike;
  };
  return { createCanvas, lost };
}

export async function makeVideo(
  library: Track[],
  input: SettingsInput,
  signal: AbortSignal,
  onProgress: (progress: Progress) => void,
  loadTiles: TileLoader = createTileLoader({ cache: cacheStorageTileCache }),
  draft = false,
): Promise<{ video: ArrayBuffer; report: VideoReport }> {
  onProgress({ stage: 'choosing' });
  const asked = parseSettings(input);
  // A draft keeps everything but the frame rate, and is drawn at the preview's size.
  const settings = draft ? { ...asked, fps: DRAFT_FPS } : asked;
  const selection = selectTracks(library, settings);
  if (selection.problem) throw new VideoProblem(problemText(selection.problem, settings));
  const tracks = selection.tracks;

  const { width, height } = draft ? previewSize(settings) : settings;
  const { fps } = settings;
  const bitrate = draft
    ? DRAFT_BITRATE
    : Math.round(FULL_HD_BITRATE * ((width * height) / (1080 * 1920)) * (fps / 30));
  const quality = new Quality({ bitrate });
  if (!(await canEncodeVideo('avc', { width, height, quality, frameRate: fps })))
    throw new VideoProblem(`This browser cannot make an H.264 video of ${width}x${height}.`);

  onProgress({ stage: 'map' });
  await loadFont();
  const canvases = watchedCanvases();
  const replay = await prepareReplay(tracks, settings, {
    createCanvas: canvases.createCanvas,
    loadTiles,
    signal,
    size: draft ? { width, height } : undefined,
  });
  if (signal.aborted) throw new Canceled();

  const { renderer } = replay;
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(renderer.canvas as unknown as OffscreenCanvas, {
    codec: 'avc',
    quality,
  });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();
  try {
    const frames = renderer.frameCount;
    for (let f = 0; f < frames; f++) {
      if (signal.aborted) throw new Canceled();
      renderer.renderFrame(f);
      await Promise.race([source.add(f / fps, 1 / fps), canvases.lost]);
      if (f % 15 === 0) onProgress({ stage: 'drawing', done: f + 1, total: frames });
    }
    onProgress({ stage: 'finishing' });
    await Promise.race([output.finalize(), canvases.lost]);
  } catch (error) {
    await output.cancel();
    throw error;
  }

  return {
    video: output.target.buffer!,
    report: {
      fileName: videoFileName(tracks, settings),
      activities: tracks.length,
      seconds: renderer.frameCount / fps,
      width,
      height,
      mapError: replay.map?.error ?? null,
    },
  };
}
