import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import {
  chronologicalTimeline,
  createRenderer,
  raceTimeline,
  parseSettings,
  planReplay,
  prepareReplay,
  STRIDE,
  type CanvasLike,
  type Metric,
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

describe('the follow camera', () => {
  const create = (w: number, h: number) => createCanvas(w, h) as unknown as CanvasLike;

  it('preserves the accumulated heat when jumping to the preview frame', async () => {
    const settings = parseSettings({ preset: 'highlight', size: '180x320', 'end-card': false });
    const prepare = () =>
      prepareReplay([route()], settings, {
        createCanvas: create,
        async loadTiles(ids) {
          expect(new Set(ids.map(({ z, x, y }) => `${z}/${x}/${y}`)).size).toBe(ids.length);
          return { tiles: ids.map((id) => ({ ...id, data: null })), downloaded: 0 };
        },
      });
    const { renderer, cameraMode, map } = await prepare();
    expect(cameraMode).toBe('follow');
    expect(map?.tiles).toBeGreaterThan(0);
    const { renderer: preview } = await prepare();
    const last = renderer.replayFrames - 1;
    for (let frame = 0; frame <= last; frame++) renderer.renderFrame(frame);
    preview.skipTo(last);
    preview.renderFrame(last);
    const pixels = (canvas: CanvasLike) =>
      Buffer.from((canvas.getContext('2d') as Context2DLike).getImageData(0, 0, 180, 320).data);
    expect(heatPixels(preview.canvas, 180, 320)).toBeGreaterThan(50);
    expect(pixels(renderer.canvas).equals(pixels(preview.canvas))).toBe(true);
  });

  it('uses the zoom-out camera and preserves the clock for a race', async () => {
    const settings = parseSettings({ preset: 'all-at-once', camera: 'follow', map: false });
    const replay = await prepareReplay([route(), route()], settings, {
      createCanvas: create,
      size: { width: 180, height: 320 },
      loadTiles: () => Promise.reject(new Error('The map is off')),
    });
    expect(replay.cameraMode).toBe('zoom');
    expect(replay.plan.timeline.mode).toBe('race');
  });

  it('assigns time within a group in proportion to route distance', () => {
    const full = route();
    const short = { ...full, points: full.points.slice(0, 40 * STRIDE) };
    const { timeline } = planReplay(
      [short, full],
      parseSettings({ camera: 'follow', group: 'all' }),
    );
    const [first, second] = timeline.windows!;
    expect(second!.start).toBeCloseTo(first!.start + first!.duration);
    expect(second!.duration / first!.duration).toBeCloseTo(119 / 39, 2);
    expect(timeline.progress(1, second!.start - 0.1)).toBe(0);
  });
});

describe('zoom levels', () => {
  const width = 180;
  const height = 320;
  const pixels = (canvas: CanvasLike) =>
    Buffer.from((canvas.getContext('2d') as Context2DLike).getImageData(0, 0, width, height).data);

  /** A replay of one route, with the canvases it made and the number of tiles it loaded. */
  async function prepare(input: { preset?: string }, lastFrameOnly = false) {
    const canvases: CanvasLike[] = [];
    let tiles = 0;
    const settings = parseSettings({ ...input, size: `${width}x${height}`, 'end-card': false });
    const replay = await prepareReplay([route()], settings, {
      createCanvas(w, h) {
        const canvas = createCanvas(w, h) as unknown as CanvasLike;
        canvases.push(canvas);
        return canvas;
      },
      async loadTiles(ids) {
        tiles += ids.length;
        return { tiles: ids.map((id) => ({ ...id, data: null })), downloaded: 0 };
      },
      lastFrameOnly,
    });
    return { ...replay, canvases, tiles };
  }

  it.each([
    ['zoom', {}],
    ['follow', { preset: 'highlight' }],
  ])(
    'set up for the last frame only, draw it as frame by frame (%s camera)',
    async (mode, input) => {
      const whole = await prepare(input);
      const preview = await prepare(input, true);
      expect(whole.cameraMode).toBe(mode);
      expect(whole.camera!.maxZoom).toBeGreaterThan(1);

      const last = whole.renderer.replayFrames - 1;
      for (let frame = 0; frame <= last; frame++) whole.renderer.renderFrame(frame);
      preview.renderer.skipTo(last);
      preview.renderer.renderFrame(last);

      // The route is in the picture, a thin line where the camera has pulled back.
      expect(heatPixels(preview.renderer.canvas, width, height)).toBeGreaterThan(10);
      expect(pixels(preview.renderer.canvas).equals(pixels(whole.renderer.canvas))).toBe(true);
      // Less of the map is loaded and set up than for the whole replay.
      expect(preview.tiles).toBeLessThan(whole.tiles);
      expect(preview.canvases.length).toBeLessThan(whole.canvases.length);
    },
  );

  it('are released once the camera has pulled back from them', async () => {
    const { renderer, canvases, map } = await prepare({});
    const levels = map!.zooms.length;
    expect(levels).toBeGreaterThan(1);
    const released = () => canvases.filter((canvas) => canvas.width === 1).length;

    renderer.renderFrame(0);
    expect(released()).toBe(0);
    for (let frame = 1; frame < renderer.replayFrames; frame++) renderer.renderFrame(frame);
    // Every level but the widest: its heat canvas and its map with the heat on it.
    expect(released()).toBe(2 * (levels - 1));
  });

  it('refuse any other frame when set up for the last one', async () => {
    const { renderer } = await prepare({}, true);
    expect(() => renderer.renderFrame(0)).toThrow('only');
  });
});

describe('a route with more points than a zoom level can show', () => {
  const width = 270;
  const height = 480;
  const fps = 30;
  const seconds = 6;

  /**
   * A straight 5 km route heading north-east with a point every meter, each one `noiseM`
   * meters off the line, to one side and then the other, like the noise of a GPS track.
   */
  function denseRoute(noiseM: number): Track {
    const count = 5000;
    const points = new Float64Array(count * STRIDE);
    for (let i = 0; i < count; i++) {
      const off = (i % 2 === 0 ? 1 : -1) * noiseM;
      const east = (i + off) * 0.7;
      const north = (i - off) * 0.7;
      points.set([19 + east / 75_000, 47.5 + north / 111_000, 0, i], i * STRIDE);
    }
    return { id: 'dense', sport: 'ride', startTime: Date.UTC(2026, 4, 2), points };
  }

  /** The heat line's pixels in the last frame, at the widest view of a camera that could zoom in far. */
  function heatAtTheEnd(track: Track, options: Partial<RenderOptions> = {}): number {
    const frames = seconds * fps;
    const camera = {
      zoom: new Float32Array(frames).fill(1),
      tx: new Float32Array(frames),
      ty: new Float32Array(frames),
      // Routes keep the points this zoom could show: about 60 for each pixel of the widest view.
      maxZoom: 64,
    };
    const renderer = createRenderer(
      [track],
      chronologicalTimeline([5_000], { duration: seconds }),
      (w, h) => createCanvas(w, h) as unknown as CanvasLike,
      { width, height, fps, camera, metrics: [], ...options },
    );
    for (let f = 0; f < renderer.replayFrames; f++) renderer.renderFrame(f);
    return heatPixels(renderer.canvas, width, height);
  }

  it('is drawn as wide as a clean one, where every point drawn would make it wider', () => {
    const clean = heatAtTheEnd(denseRoute(0));
    // Half a meter of noise: a thirtieth of a pixel at this view.
    const noisy = heatAtTheEnd(denseRoute(0.5));
    // With every point kept, as for the trim radius: the noise bends the line at every
    // point, and the round joins spill past the ends of each frame's piece.
    const everyPoint = heatAtTheEnd(denseRoute(0.5), { preserveRoutePoints: true });

    expect(clean).toBeGreaterThan(100);
    expect(noisy).toBeLessThan(clean * 1.1);
    expect(everyPoint).toBeGreaterThan(clean * 2);
  });
});

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

  /** Text pixels in the bottom left of the last frame of a video of two activities. */
  function severalLastFrame(timeline: ReturnType<typeof raceTimeline>, metrics: Metric[]) {
    const second = route();
    second.id = 'second';
    second.startTime += 2 * 86_400_000;
    const renderer = createRenderer(
      [route(), second],
      timeline,
      (w, h) => createCanvas(w, h) as unknown as CanvasLike,
      { width, height, fps: 10, metrics },
    );
    for (let f = 0; f < renderer.frameCount; f++) renderer.renderFrame(f);
    return textPixels(renderer.canvas, 0, height * 0.8, width / 2, height);
  }

  it('shows the pace for several activities, in turn or in a race, and the dates in a race', () => {
    const inTurn = chronologicalTimeline([1_190, 1_190], { duration: 1 });
    const race = raceTimeline([1_190, 1_190], { duration: 1 });
    expect(severalLastFrame(inTurn, ['pace'])).toBeGreaterThan(20);
    expect(severalLastFrame(race, ['pace'])).toBeGreaterThan(20);
    expect(severalLastFrame(race, ['date'])).toBeGreaterThan(20);
  });

  it('shows the moving time, the descent, the highest point, the days and the longest', () => {
    const inTurn = chronologicalTimeline([1_190, 1_190], { duration: 1 });
    for (const metric of ['moving', 'descent', 'highest', 'days', 'longest'] as Metric[])
      expect(severalLastFrame(inTurn, [metric]), metric).toBeGreaterThan(20);
    // One activity: its moving time, but no days or longest, which would only repeat it.
    expect(lastFrame({ metrics: ['moving'] }).bottomLeft).toBeGreaterThan(20);
    expect(lastFrame({ metrics: ['days', 'longest'] }).bottomLeft).toBe(0);
  });

  it('shows the start time for a single activity only, and the top speed for any', () => {
    const inTurn = chronologicalTimeline([1_190, 1_190], { duration: 1 });
    expect(lastFrame({ metrics: ['start'] }).bottomLeft).toBeGreaterThan(20);
    expect(severalLastFrame(inTurn, ['start'])).toBe(0);
    expect(lastFrame({ metrics: ['top-speed'] }).bottomLeft).toBeGreaterThan(20);
    expect(severalLastFrame(inTurn, ['top-speed'])).toBeGreaterThan(20);
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

  it('holds the finished picture for the end pause, then plays the end card', () => {
    const width = 270;
    const height = 480;
    const timeline = chronologicalTimeline([5_000], { duration: 2 });
    const renderer = createRenderer(
      [route()],
      timeline,
      (w, h) => createCanvas(w, h) as unknown as CanvasLike,
      { width, height, fps: 10, endPause: 1.5, endCard: true },
    );
    const pixels = () =>
      Buffer.from(
        (renderer.canvas.getContext('2d') as Context2DLike).getImageData(0, 0, width, height).data,
      );

    // 2 s of replay, 1.5 s of pause, then the end card's 3.2 s.
    expect(renderer.replayFrames).toBe(20);
    expect(renderer.frameCount).toBe(20 + 15 + 32);
    for (let f = 0; f < renderer.replayFrames; f++) renderer.renderFrame(f);
    const finished = pixels();
    for (let f = 20; f < 35; f++) {
      renderer.renderFrame(f);
      expect(pixels().equals(finished)).toBe(true);
    }
    // Halfway into the end card the map has faded to black.
    for (let f = 35; f < 35 + 16; f++) renderer.renderFrame(f);
    expect(pixels().equals(finished)).toBe(false);
  });

  it('adds no frames without an end pause', () => {
    const timeline = chronologicalTimeline([5_000], { duration: 2 });
    const create = (w: number, h: number) => createCanvas(w, h) as unknown as CanvasLike;
    const options = { width: 90, height: 160, fps: 10 };
    expect(createRenderer([route()], timeline, create, options).frameCount).toBe(20);
    expect(
      createRenderer([route()], timeline, create, { ...options, endPause: 0 }).frameCount,
    ).toBe(20);
  });
});

describe('the totals card', () => {
  /** The last frame of a video of two activities with the totals card, as raw pixels. */
  function lastTotalsFrame(totalsFields?: RenderOptions['totalsFields']) {
    const second = route();
    second.id = 'second';
    second.startTime += 86_400_000;
    const renderer = createRenderer(
      [route(), second],
      chronologicalTimeline([5_000, 5_000], { duration: 1 }),
      (w, h) => createCanvas(w, h) as unknown as CanvasLike,
      { width: 270, height: 480, fps: 10, totalsCard: true, totalsFields },
    );
    for (let f = 0; f < renderer.frameCount; f++) renderer.renderFrame(f);
    const ctx = renderer.canvas.getContext('2d') as Context2DLike;
    return Buffer.from(ctx.getImageData(0, 0, 270, 480).data);
  }

  it('shows every value unless told otherwise, and only the values picked when told', () => {
    const automatic = lastTotalsFrame();
    expect(lastTotalsFrame(['count', 'distance', 'moving', 'elevation']).equals(automatic)).toBe(
      true,
    );
    expect(lastTotalsFrame(['distance']).equals(automatic)).toBe(false);
    expect(lastTotalsFrame(['time', 'count']).equals(lastTotalsFrame(['count', 'time']))).toBe(
      false,
    );
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

  it('sits at the top in the middle unless told otherwise', () => {
    const frame = lastFrame({});

    // Centered: about as much of the text on either side of the middle.
    expect(frame.topLeft).toBeGreaterThan(10);
    expect(frame.topRight).toBeGreaterThan(10);
    expect(Math.abs(frame.topLeft - frame.topRight)).toBeLessThan(
      (frame.topLeft + frame.topRight) * 0.2,
    );
    expect(frame.bottomLeft + frame.bottomRight).toBe(0);
  });

  it('sits at the top left when told', () => {
    const frame = lastFrame({ titlePosition: 'top-left' });

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

  /** Orange pixels along the bottom left edge of the last frame, where the watermark sits. */
  function bottomOrange(watermark: boolean): number {
    const renderer = createRenderer(
      [route()],
      chronologicalTimeline([5_000], { duration: 1 }),
      (w, h) => createCanvas(w, h) as unknown as CanvasLike,
      { width, height, fps: 10, overlay: 'single', metrics: [], watermark },
    );
    for (let f = 0; f < renderer.frameCount; f++) renderer.renderFrame(f);
    const { data } = (renderer.canvas.getContext('2d') as Context2DLike).getImageData(
      0,
      height * 0.94,
      width / 2,
      height * 0.06,
    );
    let count = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i]! > 150 && data[i + 1]! > 50 && data[i + 1]! < 200 && data[i + 2]! < 90) count++;
    return count;
  }

  it('shows at the bottom left when asked', () => {
    expect(bottomOrange(true)).toBeGreaterThan(bottomOrange(false) + 30);
  });
});

describe('the elevation profile', () => {
  const width = 270;
  const height = 480;

  /** A route like `route()`, over a hill in the middle, or without elevation. */
  function hill(withElevation: boolean): Track {
    const track = route();
    const count = track.points.length / STRIDE;
    for (let i = 0; i < count; i++)
      track.points[i * STRIDE + 2] = withElevation ? 300 - Math.abs(i - count / 2) * 4 : NaN;
    return track;
  }

  /** Orange pixels in the band above the map credit, halfway through the activity. */
  function orangeAtTheBottom(track: Track, elevationProfile: boolean): number {
    const fps = 10;
    const renderer = createRenderer(
      [track],
      chronologicalTimeline([5_000], { duration: 2 }),
      (w, h) => createCanvas(w, h) as unknown as CanvasLike,
      { width, height, fps, overlay: 'single', metrics: [], elevationProfile },
    );
    for (let f = 0; f < fps; f++) renderer.renderFrame(f);
    const { data } = (renderer.canvas.getContext('2d') as Context2DLike).getImageData(
      0,
      height * 0.88,
      width,
      height * 0.08,
    );
    let count = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i]! > 60 && data[i]! > data[i + 2]! + 30) count++;
    return count;
  }

  it('shows under a single activity with elevation, when asked', () => {
    expect(orangeAtTheBottom(hill(true), true)).toBeGreaterThan(200);
    expect(orangeAtTheBottom(hill(true), false)).toBe(0);
  });

  /** Orange pixels in the profile's band of the last frame, for a video made by `prepareReplay`. */
  async function profileOrange(tracks: Track[], input: Record<string, string | boolean>) {
    const settings = parseSettings({ map: false, size: `${width}x${height}`, ...input });
    const { renderer } = await prepareReplay(tracks, settings, {
      createCanvas: (w, h) => createCanvas(w, h) as unknown as CanvasLike,
      loadTiles: () => Promise.reject(new Error('The map is off')),
    });
    const last = renderer.replayFrames - 1;
    renderer.skipTo(last);
    renderer.renderFrame(last);
    const { data } = (renderer.canvas.getContext('2d') as Context2DLike).getImageData(
      0,
      height * 0.88,
      width,
      height * 0.08,
    );
    let count = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i]! > 60 && data[i]! > data[i + 2]! + 30) count++;
    return count;
  }
  /** The hill a day later, so two activities make a trip. */
  const nextDay = (): Track => ({ ...hill(true), id: 'next', startTime: Date.UTC(2026, 4, 3) });

  it('is on by default for one activity, off for several unless switched on', async () => {
    const quiet = { metrics: false, title: '', watermark: false };
    expect(await profileOrange([hill(true)], quiet)).toBeGreaterThan(200);
    expect(await profileOrange([hill(true)], { ...quiet, 'elevation-profile': false })).toBe(0);
    const trip = [hill(true), nextDay()];
    expect(await profileOrange(trip, quiet)).toBe(0);
    expect(await profileOrange(trip, { ...quiet, 'elevation-profile': true })).toBeGreaterThan(200);
  });

  it('is left out for an activity without elevation', () => {
    expect(orangeAtTheBottom(hill(false), true)).toBe(0);
  });

  it('lifts the metrics card above it', () => {
    // Landscape, where the card would otherwise reach down to the profile.
    const [w, h] = [480, 270];
    /** The highest row of white text in the lower half of the last frame: the large value. */
    const cardTop = (elevationProfile: boolean) => {
      const renderer = createRenderer(
        [hill(true)],
        chronologicalTimeline([5_000], { duration: 1 }),
        (cw, ch) => createCanvas(cw, ch) as unknown as CanvasLike,
        { width: w, height: h, fps: 10, overlay: 'single', elevationProfile },
      );
      for (let f = 0; f < renderer.replayFrames; f++) renderer.renderFrame(f);
      for (let y = h / 2; y < h; y++)
        if (textPixels(renderer.canvas, 0, y, w / 2, y + 1) > 0) return y;
      return h;
    };
    expect(cardTop(true)).toBeLessThan(cardTop(false) - 15);
  });
});

describe('the totals card', () => {
  const width = 270;
  const height = 480;
  const fps = 10;
  /** A second route like `route()`, a day later. */
  const nextDay = (): Track => ({ ...route(), id: 'next', startTime: Date.UTC(2026, 4, 3) });
  const make = (tracks: Track[], options: Partial<RenderOptions>) =>
    createRenderer(
      tracks,
      chronologicalTimeline(
        tracks.map(() => 5_000),
        { duration: 2 },
      ),
      (w, h) => createCanvas(w, h) as unknown as CanvasLike,
      { width, height, fps, metrics: [], ...options },
    );

  it('adds its seconds after the replay, before the end card', () => {
    const plain = make([route(), nextDay()], { endCard: true });
    const withTotals = make([route(), nextDay()], { endCard: true, totalsCard: true });

    expect(withTotals.replayFrames).toBe(plain.replayFrames);
    expect(withTotals.frameCount).toBe(plain.frameCount + Math.round(3.4 * fps));
  });

  it('is left out for a single activity', () => {
    const single = make([route()], { overlay: 'single', totalsCard: true });

    expect(single.frameCount).toBe(single.replayFrames);
  });

  it('shows the totals over the dimmed map, then the end card fades from it', () => {
    const renderer = make([route(), nextDay()], {
      totalsCard: true,
      endCard: true,
      title: 'May 2026',
    });
    const totalsEnd = renderer.replayFrames + Math.round(3.4 * fps) - 1;
    for (let f = 0; f < renderer.replayFrames; f++) renderer.renderFrame(f);
    // The route, in the top fifth of the frame: away from the card's text.
    const routeAtEnd = heatPixels(renderer.canvas, width, height * 0.2);
    expect(routeAtEnd).toBeGreaterThan(20);
    for (let f = renderer.replayFrames; f <= totalsEnd; f++) renderer.renderFrame(f);

    // The values and the title in the middle; the route dimmed behind them.
    expect(textPixels(renderer.canvas, 0, height * 0.3, width, height * 0.7)).toBeGreaterThan(300);
    expect(heatPixels(renderer.canvas, width, height * 0.2)).toBeLessThan(routeAtEnd / 4);

    // The end card's first frame still shows the totals, fading out.
    renderer.renderFrame(totalsEnd + 1);
    expect(textPixels(renderer.canvas, 0, height * 0.3, width, height * 0.7)).toBeGreaterThan(100);
  });
});

describe('the watermark and the map credit', () => {
  /** The rightmost column of the watermark's orange, on the credit's line of the last frame. */
  async function watermarkRight(camera: 'fixed' | 'follow'): Promise<number> {
    const [width, height] = [540, 960];
    const settings = parseSettings({ camera, duration: '5', size: `${width}x${height}` });
    const replay = await prepareReplay([route()], settings, {
      createCanvas: (w, h) => createCanvas(w, h) as unknown as CanvasLike,
      // Empty tiles: a map, and so its credit, without drawing streets.
      loadTiles: async (ids) => ({
        tiles: ids.map((id) => ({ ...id, data: null })),
        downloaded: 0,
      }),
    });
    const { renderer } = replay;
    const last = renderer.replayFrames - 1;
    renderer.skipTo(last);
    renderer.renderFrame(last);
    const top = Math.round(height * 0.95);
    const { data } = (renderer.canvas.getContext('2d') as Context2DLike).getImageData(
      0,
      top,
      width,
      height - top,
    );
    let right = -1;
    for (let i = 0; i < data.length; i += 4)
      if (data[i]! > 150 && data[i + 1]! > 50 && data[i + 1]! < 200 && data[i + 2]! < 90)
        right = Math.max(right, (i / 4) % width);
    return right;
  }

  it('keeps to the bottom left, away from the credit, with any camera', async () => {
    const fixed = await watermarkRight('fixed');
    expect(fixed).toBeGreaterThan(0);
    expect(fixed).toBeLessThan(540 * 0.3);
    expect(Math.abs((await watermarkRight('follow')) - fixed)).toBeLessThanOrEqual(2);
  });
});
