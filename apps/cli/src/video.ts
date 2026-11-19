// Drawing a prepared replay frame by frame and encoding it to a video file with ffmpeg.

import { spawn } from 'node:child_process';
import path from 'node:path';
import type { Canvas } from '@napi-rs/canvas';
import type { MapReport, ReplayParts } from '@wornways/engine';
import { seconds } from './terminal.ts';

/** What the CLI prints about the camera and the map of a prepared replay. */
export function describeReplay(replay: ReplayParts): void {
  const { camera, cameraMode, map, renderer } = replay;
  if (cameraMode === 'follow')
    console.log('Camera     follows the routes, then pulls back to show the whole area');
  else if (camera && camera.maxZoom > 1.001)
    console.log(
      `Camera     starts ${camera.maxZoom.toFixed(1)}x closer than the final view and pulls back`,
    );
  else if (camera)
    console.log(
      'Camera     shows the whole area from the start (the activities start too far apart to zoom in)',
    );
  if (map) console.log(mapLine(map, cameraMode === 'follow'));
  console.log(
    `Heat       white at ${renderer.heatSaturation.toFixed(1)} passes (the busiest roads)`,
  );
}

function mapLine(map: MapReport, windowed: boolean): string {
  if (map.error) return `Map        unavailable, rendering without it: ${map.error}`;
  const zooms = [...new Set(map.zooms)].sort((x, y) => x - y);
  const zoomText = zooms.length > 1 ? `${zooms[0]}-${zooms[zooms.length - 1]}` : `${zooms[0]}`;
  const levels = !windowed && map.zooms.length > 1 ? ` in ${map.zooms.length} levels` : '';
  return (
    `Map        ${map.tiles} tiles at zoom ${zoomText}${levels} ` +
    `(${map.downloaded} downloaded, ${map.tiles - map.downloaded} from cache)`
  );
}

/** Draws every frame of the replay and encodes them to an MP4 file. Returns how long it took. */
export async function writeVideo(
  replay: ReplayParts,
  out: string,
): Promise<{ drawMs: number; encodeMs: number }> {
  const { renderer, width, height, fps } = replay;
  const canvas = renderer.canvas as unknown as Canvas;
  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      '-s',
      `${width}x${height}`,
      '-r',
      String(fps),
      '-i',
      'pipe:0',
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      path.resolve(out),
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] },
  );
  let ffmpegErr = '';
  ffmpeg.stderr.on('data', (d) => (ffmpegErr += d));
  const ffmpegDone = new Promise<void>((resolve, reject) => {
    ffmpeg.on('error', (err) => reject(new Error(`could not start ffmpeg: ${err.message}`)));
    ffmpeg.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}\n${ffmpegErr}`)),
    );
  });
  ffmpeg.stdin.on('error', () => {}); // a dead ffmpeg is reported through ffmpegDone

  let drawMs = 0;
  let encodeMs = 0;
  const tty = process.stdout.isTTY;
  for (let f = 0; f < renderer.frameCount; f++) {
    let t = performance.now();
    renderer.renderFrame(f);
    const pixels = canvas.data(); // raw RGBA; reading it back forces the drawing to finish
    drawMs += performance.now() - t;

    t = performance.now();
    // Waiting for each frame to be handed over keeps memory flat and makes this number
    // reflect how fast the encoder takes frames.
    const flushed = new Promise<void>((resolve) => ffmpeg.stdin.write(pixels, () => resolve()));
    await Promise.race([flushed, ffmpegDone]);
    encodeMs += performance.now() - t;
    if (tty && f % 15 === 0)
      process.stdout.write(`\rRendering  frame ${f + 1}/${renderer.frameCount}`);
  }
  const tFinish = performance.now();
  ffmpeg.stdin.end();
  await ffmpegDone;
  encodeMs += performance.now() - tFinish;
  if (tty) process.stdout.write('\r\x1b[K');
  return { drawMs, encodeMs };
}

/** The closing lines: the file and where the time went. */
export function describeTimings(
  replay: ReplayParts,
  out: string,
  ms: {
    read: number;
    activities: number;
    clean: number;
    setup: number;
    draw: number;
    encode: number;
    total: number;
  },
): void {
  const { width, height, fps, renderer, map } = replay;
  const frames = renderer.frameCount;
  const outPath = path.resolve(out);
  console.log(
    `Video      ${path.relative(process.cwd(), outPath) || outPath}  (${width}x${height}, ${Number((frames / fps).toFixed(1))} s, ${fps} fps, ${frames} frames)`,
  );
  console.log('Timings');
  console.log(`  read     ${seconds(ms.read)}  (${ms.activities} activities)`);
  console.log(`  clean    ${seconds(ms.clean)}`);
  if (map) console.log(`  map      ${seconds(ms.setup)}  (tiles and drawing the map)`);
  console.log(
    `  draw     ${seconds(ms.draw)}  (${(ms.draw / frames).toFixed(1)} ms per frame, including pixel readback)`,
  );
  console.log(`  encode   ${seconds(ms.encode)}  (ffmpeg libx264)`);
  console.log(`  total    ${seconds(ms.total)}`);
}
