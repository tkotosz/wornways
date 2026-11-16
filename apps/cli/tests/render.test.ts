import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import {
  chronologicalTimeline,
  createRenderer,
  STRIDE,
  type CanvasLike,
  type Context2DLike,
  type RenderOptions,
  type Track,
} from '@wornways/engine';

/** A 5 km loop-free route heading north-east, one point every 10 s. */
function route(): Track {
  const count = 120;
  const points = new Float64Array(count * STRIDE);
  for (let i = 0; i < count; i++) {
    points.set([19 + i * 0.0004, 47.5 + i * 0.0003, 0, i * 10], i * STRIDE);
  }
  return { id: 'route', sport: 'run', startTime: Date.UTC(2026, 4, 2), points };
}

/** Pixels where red clearly dominates (the heat line), in `height` rows from `top`. */
function heatPixels(canvas: CanvasLike, width: number, height: number, top = 0): number {
  const { data } = (canvas.getContext('2d') as Context2DLike).getImageData(0, top, width, height);
  let count = 0;
  for (let i = 0; i < data.length; i += 4)
    if (data[i]! > 150 && data[i]! > data[i + 2]! + 60) count++;
  return count;
}

/** Near-white pixels (text) in the part of the frame from (x0, y0) to (x1, y1). */
function textPixels(canvas: CanvasLike, x0: number, y0: number, x1: number, y1: number): number {
  const context = canvas.getContext('2d') as Context2DLike;
  const { data } = context.getImageData(x0, y0, x1 - x0, y1 - y0);
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i]! > 180 && data[i + 1]! > 180 && data[i + 2]! > 180) count++;
  }
  return count;
}

describe('the metrics card', () => {
  const width = 270;
  const height = 480;

  /** Text pixels in the top-right and the bottom-left of the last frame. */
  function lastFrame(options: Partial<RenderOptions>) {
    const renderer = createRenderer(
      [route()],
      chronologicalTimeline([5_000], { duration: 1 }),
      (w, h) => createCanvas(w, h) as unknown as CanvasLike,
      { width, height, fps: 10, overlay: 'single', ...options },
    );
    for (let f = 0; f < renderer.frameCount; f++) renderer.renderFrame(f);
    return {
      topRight: textPixels(renderer.canvas, width / 2, 0, width, height * 0.15),
      bottomLeft: textPixels(renderer.canvas, 0, height * 0.8, width / 2, height),
    };
  }

  it('sits at the bottom left unless told otherwise', () => {
    const frame = lastFrame({});

    expect(frame.bottomLeft).toBeGreaterThan(20);
    expect(frame.topRight).toBe(0);
  });

  it('moves to the chosen corner', () => {
    const frame = lastFrame({ metricsPosition: 'top-right' });

    expect(frame.topRight).toBeGreaterThan(20);
    expect(frame.bottomLeft).toBe(0);
  });

  it('is left out when it has no values', () => {
    const frame = lastFrame({ metrics: [] });

    expect(frame.bottomLeft).toBe(0);
    expect(frame.topRight).toBe(0);
  });

  it('grows with the text size', () => {
    expect(lastFrame({ metricsScale: 2 }).bottomLeft).toBeGreaterThan(lastFrame({}).bottomLeft * 2);
  });
});

describe('rendering a replay', () => {
  it('draws a heat line that grows to the end', () => {
    const width = 270;
    const height = 480;
    const timeline = chronologicalTimeline([5_000], { duration: 2 });
    const renderer = createRenderer(
      [route()],
      timeline,
      (w, h) => createCanvas(w, h) as unknown as CanvasLike,
      { width, height, fps: 10 },
    );

    renderer.renderFrame(0);
    const atStart = heatPixels(renderer.canvas, width, height);
    for (let f = 1; f < renderer.frameCount; f++) renderer.renderFrame(f);
    const atEnd = heatPixels(renderer.canvas, width, height);

    expect(renderer.frameCount).toBe(20);
    expect(atEnd).toBeGreaterThan(50);
    expect(atEnd).toBeGreaterThan(atStart);
  });
});

describe('the title', () => {
  const width = 270;
  const height = 480;

  /** Text pixels in each quarter band of the last frame: top and bottom, left and right. */
  function lastFrame(options: Partial<RenderOptions>) {
    const renderer = createRenderer(
      [route()],
      chronologicalTimeline([5_000], { duration: 1 }),
      (w, h) => createCanvas(w, h) as unknown as CanvasLike,
      { width, height, fps: 10, overlay: 'single', title: 'Morning', metrics: [], ...options },
    );
    for (let f = 0; f < renderer.frameCount; f++) renderer.renderFrame(f);
    const band = (x: number, y: number) =>
      textPixels(renderer.canvas, x, y, x + width / 2, y + height * 0.2);
    return {
      topLeft: band(0, 0),
      topRight: band(width / 2, 0),
      bottomLeft: band(0, height * 0.8),
      bottomRight: band(width / 2, height * 0.8),
    };
  }

  it('sits at the top left unless told otherwise', () => {
    const frame = lastFrame({});

    expect(frame.topLeft).toBeGreaterThan(20);
    expect(frame.topRight + frame.bottomLeft + frame.bottomRight).toBe(0);
  });

  it('moves to the chosen corner and grows with its size', () => {
    const right = lastFrame({ titlePosition: 'bottom-right' });

    expect(right.bottomRight).toBeGreaterThan(20);
    expect(right.topLeft).toBe(0);
    expect(lastFrame({ titlePosition: 'bottom-right', titleScale: 2 }).bottomRight).toBeGreaterThan(
      right.bottomRight * 2,
    );
  });

  it('sits in the middle row, away from the edges', () => {
    const renderer = createRenderer(
      [route()],
      chronologicalTimeline([5_000], { duration: 1 }),
      (w, h) => createCanvas(w, h) as unknown as CanvasLike,
      {
        width,
        height,
        fps: 10,
        overlay: 'single',
        title: 'Morning',
        metrics: [],
        titlePosition: 'middle-left',
      },
    );
    for (let f = 0; f < renderer.frameCount; f++) renderer.renderFrame(f);

    expect(textPixels(renderer.canvas, 0, height * 0.4, width / 2, height * 0.6)).toBeGreaterThan(
      20,
    );
    expect(textPixels(renderer.canvas, 0, 0, width, height * 0.2)).toBe(0);
    expect(textPixels(renderer.canvas, 0, height * 0.8, width, height)).toBe(0);
  });

  it('sits in the middle of an edge', () => {
    const frame = lastFrame({ titlePosition: 'bottom-center' });

    // Centered text reaches into both halves of the frame.
    expect(frame.bottomLeft).toBeGreaterThan(5);
    expect(frame.bottomRight).toBeGreaterThan(5);
    expect(frame.topLeft + frame.topRight).toBe(0);
  });

  it('stacks with a metrics card it would meet on the same edge', () => {
    const titleAlone = lastFrame({ titlePosition: 'bottom-center' });
    const cardAlone = lastFrame({ title: undefined, metrics: ['time'] });
    const both = lastFrame({ titlePosition: 'bottom-center', metrics: ['time'] });
    const sum = (f: typeof both) => f.bottomLeft + f.bottomRight;

    expect(sum(both)).toBeGreaterThanOrEqual(Math.round((sum(titleAlone) + sum(cardAlone)) * 0.95));
  });

  it('stacks with the metrics card in the same corner instead of overlapping it', () => {
    const titleAlone = lastFrame({ titlePosition: 'bottom-left' }).bottomLeft;
    const cardAlone = lastFrame({ title: undefined, metrics: ['time'] }).bottomLeft;
    const both = lastFrame({ titlePosition: 'bottom-left', metrics: ['time'] }).bottomLeft;

    // Overlapping text would light up fewer pixels than the two apart.
    expect(both).toBeGreaterThanOrEqual(Math.round((titleAlone + cardAlone) * 0.95));
  });
});

describe('skipping ahead', () => {
  it('draws the last frame as if every frame before it had been drawn', () => {
    const width = 270;
    const height = 480;
    const make = () =>
      createRenderer(
        [route()],
        chronologicalTimeline([5_000], { duration: 2 }),
        (w, h) => createCanvas(w, h) as unknown as CanvasLike,
        { width, height, fps: 10, overlay: 'single' },
      );
    const pixels = (canvas: CanvasLike) =>
      (canvas.getContext('2d') as Context2DLike).getImageData(0, 0, width, height).data;

    const drawn = make();
    for (let f = 0; f < drawn.frameCount; f++) drawn.renderFrame(f);
    const skipped = make();
    const last = skipped.frameCount - 1;
    skipped.skipTo(last);
    skipped.renderFrame(last);

    expect(Buffer.from(pixels(skipped.canvas)).equals(Buffer.from(pixels(drawn.canvas)))).toBe(
      true,
    );
    expect(() => skipped.skipTo(0)).toThrow('Cannot skip from frame');
  });
});

describe('the end card', () => {
  const width = 270;
  const height = 480;
  const make = (endCard: boolean) =>
    createRenderer(
      [route()],
      chronologicalTimeline([5_000], { duration: 2 }),
      (w, h) => createCanvas(w, h) as unknown as CanvasLike,
      { width, height, fps: 10, overlay: 'single', endCard },
    );
  const pixels = (canvas: CanvasLike) =>
    Buffer.from((canvas.getContext('2d') as Context2DLike).getImageData(0, 0, width, height).data);

  /** Orange pixels in the middle of the frame, where the logo sits. */
  function logoPixels(canvas: CanvasLike): number {
    const { data } = (canvas.getContext('2d') as Context2DLike).getImageData(
      0,
      height * 0.35,
      width,
      height * 0.3,
    );
    let count = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i]! > 200 && data[i + 1]! > 70 && data[i + 1]! < 200 && data[i + 2]! < 80) count++;
    return count;
  }

  /** Heat-line pixels above and below the middle of the frame, away from the logo. */
  const heatAround = (canvas: CanvasLike) =>
    heatPixels(canvas, width, height * 0.3) + heatPixels(canvas, width, height * 0.3, height * 0.7);

  it('adds 3.2 seconds after the replay', () => {
    expect(make(false).frameCount).toBe(20);
    expect(make(true).replayFrames).toBe(20);
    expect(make(true).frameCount).toBe(52);
  });

  it('fades the finished map to black and draws the logo', () => {
    const renderer = make(true);
    for (let f = 0; f < renderer.replayFrames; f++) renderer.renderFrame(f);
    const finished = pixels(renderer.canvas);
    const heatAtEnd = heatAround(renderer.canvas);
    const logoAtEnd = logoPixels(renderer.canvas);

    renderer.renderFrame(renderer.replayFrames);
    expect(pixels(renderer.canvas).equals(finished)).toBe(true);

    for (let f = renderer.replayFrames + 1; f < renderer.frameCount; f++) renderer.renderFrame(f);
    expect(heatAtEnd).toBeGreaterThan(20);
    expect(heatAround(renderer.canvas)).toBe(0);
    expect(logoPixels(renderer.canvas)).toBeGreaterThan(logoAtEnd + 200);
  });

  it('cannot be skipped to: it is drawn over the replay', () => {
    expect(() => make(true).skipTo(20)).toThrow('Cannot skip from frame');
  });
});

describe('the watermark', () => {
  const width = 270;
  const height = 480;

  /** Orange pixels along the bottom edge of the last frame, where the watermark sits. */
  function bottomOrange(watermark: boolean): number {
    const renderer = createRenderer(
      [route()],
      chronologicalTimeline([5_000], { duration: 1 }),
      (w, h) => createCanvas(w, h) as unknown as CanvasLike,
      { width, height, fps: 10, overlay: 'single', metrics: [], watermark },
    );
    for (let f = 0; f < renderer.frameCount; f++) renderer.renderFrame(f);
    const { data } = (renderer.canvas.getContext('2d') as Context2DLike).getImageData(
      width / 2,
      height * 0.94,
      width / 2,
      height * 0.06,
    );
    let count = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i]! > 150 && data[i + 1]! > 50 && data[i + 1]! < 200 && data[i + 2]! < 90) count++;
    return count;
  }

  it('shows at the bottom right when asked', () => {
    expect(bottomOrange(true)).toBeGreaterThan(bottomOrange(false) + 30);
  });
});
