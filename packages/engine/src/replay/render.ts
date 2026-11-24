import { drawBasemap, type Basemap, type MapLabel, type Tile } from '../map/basemap.ts';
import { levelsFor, mapLevelViews, type CameraPath, type LevelWindow } from './camera.ts';
import { drawElevationProfile, elevationProfile } from './elevation-profile.ts';
import { drawEndCard, endCardFrames } from './end-card.ts';
import { drawTotalsCard, movingSeconds, totalsCardFrames, type Totals } from './totals-card.ts';
import { drawWatermark } from './mark.ts';
import { composeHeat, createHeatRamp, decodeHeat, heatStyle, saturationFromHeat } from './heat.ts';
import { projectTrack, type Projected } from './project.ts';
import type { Timeline } from './timeline.ts';
import type { Track } from '../track/types.ts';
import { fitView, type View } from './view.ts';

// The engine draws through this minimal subset of the Canvas 2D API so the same code runs
// on an OffscreenCanvas in a worker and on a native canvas in Node.
export interface GradientLike {
  addColorStop(offset: number, color: string): void;
}

export interface Context2DLike {
  globalCompositeOperation: string;
  globalAlpha: number;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  strokeStyle: unknown;
  fillStyle: unknown;
  font: string;
  textAlign: string;
  textBaseline: string;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  stroke(): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  /** With `maxWidth`, text wider than that is drawn narrower to fit. */
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  strokeText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  drawImage(image: unknown, dx: number, dy: number): void;
  getImageData(
    sx: number,
    sy: number,
    sw: number,
    sh: number,
  ): { data: Uint8ClampedArray; width: number; height: number };
  putImageData(imageData: unknown, dx: number, dy: number): void;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): GradientLike;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): GradientLike;
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d', options?: { willReadFrequently?: boolean }): unknown;
}

export type CanvasFactory = (width: number, height: number) => CanvasLike;

/** A value the metrics card can show. */
export type Metric = 'time' | 'distance' | 'pace' | 'elevation' | 'date' | 'count';
export const METRICS: readonly Metric[] = [
  'time',
  'distance',
  'pace',
  'elevation',
  'date',
  'count',
];

/** Where on the frame a block of text sits: an edge, then the side or the middle. */
export type Position =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';
/** Every position, row by row: the top, the middle and the bottom of the frame. */
export const POSITIONS: readonly Position[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export type RenderOptions = {
  width: number;
  height: number;
  fps: number;
  /**
   * Ask for CPU-backed canvases where pixels are read back every frame (the heat layers).
   * Browsers otherwise keep them on the GPU, where each read stalls. Default true.
   */
  readbackHint?: boolean;
  /** Pass count shown as the hottest colour; by default a high percentile of the final heatmap. */
  heatSaturation?: number;
  background?: string;
  /** Where the tracks sit in the frame; defaults to `fitView(tracks, width, height)`. */
  view?: View;
  /** Without a moving camera the frame stays on `view`. */
  camera?: CameraPath;
  /** Keep the clipped path's vertices so shortcuts cannot cross its hidden areas. */
  preserveRoutePoints?: boolean;
  /** Street map drawn under the heatmap, with one level per entry of `mapLevelViews`. */
  basemap?: Basemap;
  /** Bounded map and heat canvases for a camera that pans over long distances. */
  levelWindows?: {
    levels: (LevelWindow & { tiles?: Tile[] })[][];
    attribution?: string;
  };
  title?: string;
  /** Singular and plural noun for the counter, e.g. ["ride", "rides"]. */
  countLabel?: [string, string];
  /** Race mode: what the activities are doing while under way, e.g. "riding". */
  movingLabel?: string;
  /** "single": one activity with its own elapsed time and distance as live stats. */
  overlay?: 'auto' | 'single';
  /**
   * The values of the metrics card in order, the first one large; empty: no card. A value
   * the video cannot show is left out: pace exists for a single activity only, count for
   * several activities only, the date not when all play at once, elevation only when
   * recorded. Default: what suits the video (see `defaultMetrics`).
   */
  metrics?: Metric[];
  /** Where the metrics card sits; default bottom-left. */
  metricsPosition?: Position;
  /** Where the title sits; default top-left. */
  titlePosition?: Position;
  /** Scales the title; default 1. */
  titleScale?: number;
  /** Scales the metrics card; default 1. */
  metricsScale?: number;
  /**
   * The one frame of the replay that will be drawn, after `skipTo` it: the zoom levels it
   * does not show are not set up, and drawing any other frame is an error.
   */
  onlyFrame?: number;
  /**
   * Seconds the replay's last frame stays on screen after the replay, before the totals
   * card and the end card. Default 0.
   */
  endPause?: number;
  /** End the video with the Wornways card (see end-card.ts), after the replay. Default false. */
  endCard?: boolean;
  /**
   * Several activities: the card of their totals (see totals-card.ts) after the replay,
   * before the end card. Default false.
   */
  totalsCard?: boolean;
  /** Draw the small Wornways mark on the map credit's line. Default false. */
  watermark?: boolean;
  /**
   * The activities' climb profile along the bottom, end to end, with a dot moving along
   * each one being drawn; left out when none has elevation. Text at the bottom goes above
   * it. Default false.
   */
  elevationProfile?: boolean;
  fontFamily?: string;
  /** BCP 47 locale for the date counter. */
  locale?: string;
};

export type Renderer = {
  /** Holds the most recently rendered frame. */
  readonly canvas: CanvasLike;
  /** Every frame of the video: the replay's, the end pause's, then the cards'. */
  readonly frameCount: number;
  /** The replay's frames; the end pause's and the cards' follow them. */
  readonly replayFrames: number;
  /** Pass count that shows as the hottest colour. */
  readonly heatSaturation: number;
  /** Frames must be rendered in order starting from 0: the heatmap only ever grows. */
  renderFrame(index: number): void;
  /**
   * Moves on to frame `index` without drawing the frames before it: their routes are added
   * to the heatmap, nothing is drawn. Then `renderFrame(index)` draws that frame exactly as
   * if every frame before it had been drawn. Used to show a single moment, such as the end.
   */
  skipTo(index: number): void;
};

type Prepared = Projected & {
  date: string;
  // Drawing state
  /** Index of the last point the head has passed. */
  idx: number;
  headX: number;
  headY: number;
  metres: number;
  /** Metres climbed so far. */
  climbed: number;
  started: boolean;
  done: boolean;
  /** Video time at which the track finished drawing. */
  doneAt: number;
};

type Rect = { x0: number; y0: number; x1: number; y1: number };
type RoutePiece = Rect & { xy: number[] };

/**
 * The scene at one zoom level. Level pixel q shows base-view pixel q / k + (ox, oy).
 * Routes accumulate as pass counts on `heat`; `composed` is the map with the coloured heat
 * on top, brought up to date lazily for the rectangles in `dirty`.
 */
type Level = {
  width: number;
  height: number;
  k: number;
  ox: number;
  oy: number;
  heat: CanvasLike;
  heatCtx: Context2DLike;
  composed: CanvasLike;
  composedCtx: Context2DLike;
  map: Uint8ClampedArray;
  labels: MapLabel[];
  dirty: Rect[];
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clockText = (s: number) =>
  `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const smoothstep = (f: number) => f * f * (3 - 2 * f);
/** The horizontal part of a position: the side it is on, or the middle. */
const sideOf = (position: Position) =>
  position.endsWith('left') ? 'left' : position.endsWith('right') ? 'right' : 'center';
/** The vertical part of a position: the frame's top, middle or bottom. */
const rowOf = (position: Position) =>
  position.startsWith('top') ? 'top' : position.startsWith('middle') ? 'middle' : 'bottom';
const wholeNumber = (n: number) => Math.round(n).toLocaleString('en-US');

/** Points of a route closer together than this, in pixels as drawn, add nothing to the line. */
const MIN_GAP_PX = 0.35;

/**
 * Adds the line through the first `count` points of `xy` ([x, y] per point) to the path,
 * leaving out the points closer than `gap` to the last one drawn. The two ends are always
 * drawn, so the pieces of a route still meet.
 */
function tracePoints(c: Context2DLike, xy: ArrayLike<number>, count: number, gap: number): void {
  let lastX = xy[0];
  let lastY = xy[1];
  c.moveTo(lastX, lastY);
  const end = count - 1;
  for (let i = 1; i < end; i++) {
    const x = xy[i * 2];
    const y = xy[i * 2 + 1];
    if ((x - lastX) ** 2 + (y - lastY) ** 2 < gap * gap) continue;
    lastX = x;
    lastY = y;
    c.lineTo(x, y);
  }
  if (end > 0) c.lineTo(xy[end * 2], xy[end * 2 + 1]);
}

/** Sports whose speed is told as minutes per kilometre. */
const isOnFoot = (sport: string) => /run|walk|hike/.test(sport);

/** Average pace ("5:32 /km") or, off foot, speed ("24.3 km/h") over the distance so far. */
function paceText(sport: string, seconds: number, metres: number): string {
  const moving = seconds > 0 && metres >= 20;
  if (!isOnFoot(sport))
    return `${moving ? (metres / 1000 / (seconds / 3600)).toFixed(1) : '0.0'} km/h`;
  if (!moving) return '–:–– /km';
  const perKm = Math.round(seconds / (metres / 1000));
  return `${Math.floor(perKm / 60)}:${String(perKm % 60).padStart(2, '0')} /km`;
}

/**
 * What the overlay describes: one activity, a race of every activity on one clock, or
 * groups of activities one after another.
 */
export type OverlayKind = 'single' | 'race' | 'groups';

/** The metrics a video shows when none are asked for, the first one large. */
export function defaultMetrics(kind: OverlayKind): Metric[] {
  if (kind === 'single') return ['time', 'distance', 'date'];
  if (kind === 'race') return ['time', 'count', 'distance'];
  return ['date', 'count', 'distance'];
}

export function createRenderer(
  tracks: Track[],
  timeline: Timeline,
  createCanvas: CanvasFactory,
  options: RenderOptions,
): Renderer {
  if (tracks.length === 0) throw new Error('No tracks to render');

  const { width: W, height: H, fps, camera, basemap } = options;
  const background = options.background ?? '#090b10';
  const fontFamily =
    options.fontFamily ?? '"Inter", "Noto Sans", "Helvetica Neue", Arial, sans-serif';
  const [singular, plural] = options.countLabel ?? ['activity', 'activities'];
  const movingLabel = options.movingLabel ?? 'moving';
  const kind: OverlayKind =
    options.overlay === 'single' ? 'single' : timeline.clock ? 'race' : 'groups';
  const metrics = options.metrics ?? defaultMetrics(kind);
  const corner = options.metricsPosition ?? 'bottom-left';
  const titleCorner = options.titlePosition ?? 'top-left';
  const titleScale = options.titleScale ?? 1;
  const metricsScale = options.metricsScale ?? 1;
  const unit = Math.min(W, H) / 1080; // scales strokes and type with the output size
  const dateFormat = new Intl.DateTimeFormat(options.locale ?? 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const replayFrames = Math.round(timeline.duration * fps);
  const pauseFrames = Math.round((options.endPause ?? 0) * fps);
  // The totals card is for several activities only.
  const totalsFrames = options.totalsCard && kind !== 'single' ? totalsCardFrames(fps) : 0;
  const frameCount =
    replayFrames + pauseFrames + totalsFrames + (options.endCard ? endCardFrames(fps) : 0);
  if (camera && camera.zoom.length < replayFrames)
    throw new Error('Camera path is shorter than the video');
  const { onlyFrame } = options;
  if (onlyFrame !== undefined && !(onlyFrame >= 0 && onlyFrame < replayFrames))
    throw new Error(`Frame ${onlyFrame} is not one of the replay's ${replayFrames} frames`);

  const view = options.view ?? fitView(tracks, W, H);
  const readback = options.readbackHint === false ? undefined : { willReadFrequently: true };
  const windows = options.levelWindows?.levels;
  const attribution = options.levelWindows?.attribution ?? basemap?.attribution;
  if (!camera && (basemap?.levels.length ?? 1) !== 1)
    throw new Error('A fixed camera takes a basemap with one level');

  // The routes keep the points the closest zoom of the camera can show. A wider zoom level
  // strokes fewer of them: the ones its own pixels can show (see `strokePiece`).
  const minGapPx = options.preserveRoutePoints ? 0 : MIN_GAP_PX / (camera?.maxZoom ?? 1);
  /** The gap between a route's points on a level drawn at `k` times the base view's scale. */
  const levelGap = (k: number) => (options.preserveRoutePoints ? 0 : MIN_GAP_PX / k);
  const prepared: Prepared[] = tracks.map((track) => ({
    ...projectTrack(track, view, minGapPx),
    date: dateFormat.format(track.startTime),
    idx: 0,
    headX: 0,
    headY: 0,
    metres: 0,
    climbed: 0,
    started: false,
    done: false,
    doneAt: Infinity,
  }));

  // One pass adds 1 at the centre of a route, less in its glow.
  const strokes = [
    { width: 9 * unit, style: heatStyle(0.12) },
    { width: 4.5 * unit, style: heatStyle(0.18) },
    { width: 1.7 * unit, style: heatStyle(0.7) },
  ];
  const pad = strokes[0].width / 2 + 2;

  const prepareHeat = (c: Context2DLike, w: number, h: number) => {
    // Opaque black, so the counts read back exactly (no premultiplied alpha).
    c.fillStyle = '#000';
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'lighter';
    // Butt caps let each frame's new piece meet the previous one without overlapping it,
    // which would otherwise count the joint twice.
    c.lineCap = 'butt';
    c.lineJoin = 'round';
  };

  // --- Heat scale: render the finished heatmap once to find how busy the busiest roads get. ---
  let saturation = options.heatSaturation ?? 0;
  if (!saturation) {
    const probe = createCanvas(W, H);
    const pc = probe.getContext('2d', readback) as Context2DLike;
    prepareHeat(pc, W, H);
    for (const tr of prepared) {
      pc.beginPath();
      // At the base view's scale, with the points its level keeps.
      tracePoints(pc, tr.xy, tr.count, levelGap(1));
      for (const s of strokes) {
        pc.lineWidth = s.width;
        pc.strokeStyle = s.style;
        pc.stroke();
      }
    }
    const passes = new Float32Array(W * H);
    decodeHeat(pc.getImageData(0, 0, W, H).data, passes);
    saturation = saturationFromHeat(passes);
  }
  const ramp = createHeatRamp(saturation);

  // --- Map and heat for each zoom level ---
  const labelFont = (size: number) => `500 ${Math.round(size)}px ${fontFamily}`;
  function createLevel(lv: View, tiles?: Tile[]): Level {
    const k = lv.scale / view.scale;
    const ox = view.offX - lv.offX / k;
    const oy = view.offY - lv.offY / k;
    const composed = createCanvas(lv.width, lv.height);
    // No readback hint: this canvas is read once, for the map's pixels, and only written
    // and shown after that. With the hint a browser keeps it in memory, and uploads it
    // whole to the GPU every time it changed and is drawn onto the frame.
    const composedCtx = composed.getContext('2d') as Context2DLike;
    composedCtx.fillStyle = background;
    composedCtx.fillRect(0, 0, lv.width, lv.height);

    const labels: MapLabel[] = [];
    if (tiles) {
      const places = drawBasemap(composedCtx, lv, tiles, unit);
      // Keep the most important place names that fit without touching each other.
      const limit = 28 * Math.max(1, (lv.width * lv.height) / (W * H));
      const boxes: Rect[] = [];
      for (const place of places) {
        if (labels.length >= limit) break;
        composedCtx.font = labelFont(place.size);
        const halfW = composedCtx.measureText(place.text).width / 2 + 10 * unit;
        const halfH = place.size * 0.7 + 4 * unit;
        const box = {
          x0: place.x - halfW,
          y0: place.y - halfH,
          x1: place.x + halfW,
          y1: place.y + halfH,
        };
        if (!camera && (box.x0 < 0 || box.x1 > W)) continue; // a fixed frame would cut it off
        if (boxes.some((o) => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0))
          continue;
        boxes.push(box);
        labels.push({ ...place, x: place.x / k + ox, y: place.y / k + oy });
      }
    }
    const map = composedCtx.getImageData(0, 0, lv.width, lv.height).data;

    const heat = createCanvas(lv.width, lv.height);
    const heatCtx = heat.getContext('2d', readback) as Context2DLike;
    prepareHeat(heatCtx, lv.width, lv.height);
    heatCtx.setTransform(k, 0, 0, k, -ox * k, -oy * k);
    return {
      width: lv.width,
      height: lv.height,
      k,
      ox,
      oy,
      heat,
      heatCtx,
      composed,
      composedCtx,
      map,
      labels,
      dirty: [],
    };
  }

  // Without windows, every level covers all that is shown at its zoom, and a level is kept
  // only as long as a frame still to draw shows it. `lastShown` is that frame for each
  // level, -1 for a level no frame shows: a camera that only pulls back lets go of its
  // closer levels one by one.
  const levelSources: { view: View; tiles?: Tile[] }[] = windows
    ? []
    : (basemap?.levels ?? mapLevelViews(view, camera).map((levelView) => ({ view: levelView })));
  const lastShown = new Int32Array(levelSources.length).fill(-1);
  if (levelSources.length > 0) {
    const first = onlyFrame ?? 0;
    const last = onlyFrame ?? replayFrames - 1;
    for (let f = first; f <= last; f++) {
      const [a, b] = camera ? levelsFor(camera.zoom[f], levelSources.length - 1) : [0, 0];
      lastShown[a] = f;
      lastShown[b] = f;
    }
  }
  const levels: (Level | undefined)[] = windows
    ? windows.map(() => undefined)
    : levelSources.map(({ view, tiles }, i) =>
        lastShown[i] >= 0 ? createLevel(view, tiles) : undefined,
      );
  const windowIndices = windows?.map(() => -1);

  /** Gives a level's canvases back at once, which matters on phones, and forgets the level. */
  function releaseLevel(i: number): void {
    const level = levels[i];
    if (!level) return;
    level.heat.width = 1;
    level.heat.height = 1;
    level.composed.width = 1;
    level.composed.height = 1;
    levels[i] = undefined;
  }

  /** Releases the levels that no frame from `index` on shows. Windows are released as they close. */
  function releaseLevelsBefore(index: number): void {
    for (let i = 0; i < lastShown.length; i++) if (lastShown[i] < index) releaseLevel(i);
  }
  // Windows opened later need the route as it was originally stroked, including where
  // pieces meet. Replaying the same pieces preserves pass counts at those joins.
  const history: RoutePiece[] = [];

  function strokePiece(level: Level, piece: RoutePiece): void {
    const rect = {
      x0: (piece.x0 - level.ox) * level.k - pad,
      y0: (piece.y0 - level.oy) * level.k - pad,
      x1: (piece.x1 - level.ox) * level.k + pad,
      y1: (piece.y1 - level.oy) * level.k + pad,
    };
    if (rect.x1 < 0 || rect.y1 < 0 || rect.x0 > level.width || rect.y0 > level.height) return;
    const c = level.heatCtx;
    c.beginPath();
    // Points closer together than this level can show are left out. They add no detail,
    // and with the noise of a GPS track between them they bend the line back and forth:
    // its round joins then spill past the piece's flat ends, onto the pieces before and
    // after it, where the pass is counted twice.
    tracePoints(c, piece.xy, piece.xy.length / 2, levelGap(level.k));
    for (const s of strokes) {
      c.lineWidth = s.width / level.k;
      c.strokeStyle = s.style;
      c.stroke();
    }
    markDirty(level, rect);
  }

  const frame = createCanvas(W, H);
  const ctx = frame.getContext('2d') as Context2DLike;
  // Gradients that darken the map behind the counters and the title.
  const bottomShade = ctx.createLinearGradient(0, H * 0.76, 0, H * 0.9);
  bottomShade.addColorStop(0, 'rgba(5, 6, 9, 0)');
  bottomShade.addColorStop(1, 'rgba(5, 6, 9, 0.88)');
  const topShade = ctx.createLinearGradient(0, 0, 0, H * 0.12);
  topShade.addColorStop(0, 'rgba(5, 6, 9, 0.88)');
  topShade.addColorStop(1, 'rgba(5, 6, 9, 0)');

  // Title and metrics card
  const margin = W * 0.07;
  /** Where text with this alignment starts. */
  const xOf = (side: 'left' | 'center' | 'right') =>
    side === 'left' ? margin : side === 'right' ? W - margin : W / 2;
  const titleFont = `600 ${Math.round(44 * unit * titleScale)}px ${fontFamily}`;
  const headlineFont = `600 ${Math.round(60 * unit * metricsScale)}px ${fontFamily}`;
  const statusFont = `400 ${Math.round(32 * unit * metricsScale)}px ${fontFamily}`;
  const statusGap = 50 * unit * metricsScale; // from the large value down to the first line under it
  const statusStep = 42 * unit * metricsScale; // between the lines under it
  const cardRow = rowOf(corner);
  const cardOnTop = cardRow === 'top';
  const cardSide = sideOf(corner);
  const titleRow = rowOf(titleCorner);
  const titleOnTop = titleRow === 'top';
  const titleSide = sideOf(titleCorner);
  /**
   * Whether the title and the card would meet: in the same row, on the same side or with
   * either in the middle. Then they stack, the title first.
   */
  const stacked =
    !!options.title &&
    cardRow === titleRow &&
    (cardSide === titleSide || cardSide === 'center' || titleSide === 'center');
  const hasElevation = prepared.some((tr) => tr.hasElevation);

  // The climb profile: across the frame between the margins, just above the map credit.
  const profileHeight = 80 * unit;
  const profileBox = {
    x: margin,
    y: H - H * 0.012 - 34 * unit - profileHeight,
    width: W - 2 * margin,
    height: profileHeight,
  };
  const profile = options.elevationProfile
    ? elevationProfile(
        tracks,
        Math.round(Math.min(600, Math.max(50, profileBox.width / (3 * unit)))),
      )
    : null;
  /** The lowest baseline text in the bottom row may take: above the profile when it shows. */
  const textFloor = profile ? profileBox.y - 30 * unit : H * 0.955;

  const headFade = 0.35; // seconds a head dot lingers after its track finishes
  const headRadius = 15 * unit;
  /** How strongly a track's head dot shows at time `t`: 1 while it moves, fading after. */
  const headAlpha = (tr: Prepared, t: number) => {
    if (!tr.started) return 0;
    const sinceEnd = t - tr.doneAt;
    if (sinceEnd >= headFade) return 0;
    return sinceEnd <= 0 ? 1 : 1 - sinceEnd / headFade;
  };
  let nextFrame = 0;

  function markDirty(level: Level, r: Rect): void {
    const x0 = Math.max(0, Math.floor(r.x0));
    const y0 = Math.max(0, Math.floor(r.y0));
    const x1 = Math.min(level.width, Math.ceil(r.x1));
    const y1 = Math.min(level.height, Math.ceil(r.y1));
    if (x0 >= x1 || y0 >= y1) return;
    // Merge with an overlapping rectangle so busy areas are recoloured once, not per track.
    for (const d of level.dirty) {
      if (x0 <= d.x1 && x1 >= d.x0 && y0 <= d.y1 && y1 >= d.y0) {
        d.x0 = Math.min(d.x0, x0);
        d.y0 = Math.min(d.y0, y0);
        d.x1 = Math.max(d.x1, x1);
        d.y1 = Math.max(d.y1, y1);
        return;
      }
    }
    level.dirty.push({ x0, y0, x1, y1 });
  }

  /** Recolours what changed on a level since it was last shown. */
  function flush(level: Level): void {
    for (const r of level.dirty) {
      const w = r.x1 - r.x0;
      const h = r.y1 - r.y0;
      const image = level.heatCtx.getImageData(r.x0, r.y0, w, h);
      composeHeat(ramp, image.data, w, h, level.map, level.width, r.x0, r.y0);
      level.composedCtx.putImageData(image, r.x0, r.y0);
    }
    level.dirty.length = 0;
  }

  /** Moves every head to where it is at time `t` and adds the new piece of route to every level. */
  function advance(t: number): void {
    const piece: number[] = [];
    for (let k = 0; k < prepared.length; k++) {
      const tr = prepared[k];
      if (tr.done) continue;
      const progress = timeline.progress(k, t);
      // In a race, and in a single-activity replay, riders wait at the start until the clock runs.
      if (progress <= 0 && timeline.mode !== 'race' && options.overlay !== 'single') continue;
      if (!tr.started) {
        tr.started = true;
        tr.headX = tr.xy[0];
        tr.headY = tr.xy[1];
      }

      piece.length = 0;
      piece.push(tr.headX, tr.headY);
      let i = tr.idx;
      while (i + 1 < tr.count && tr.u[i + 1] <= progress) {
        i++;
        piece.push(tr.xy[i * 2], tr.xy[i * 2 + 1]);
      }
      tr.idx = i;
      if (i + 1 < tr.count) {
        // The head sits part-way along the next segment.
        const f = (progress - tr.u[i]) / (tr.u[i + 1] - tr.u[i]);
        tr.headX = tr.xy[i * 2] + f * (tr.xy[i * 2 + 2] - tr.xy[i * 2]);
        tr.headY = tr.xy[i * 2 + 1] + f * (tr.xy[i * 2 + 3] - tr.xy[i * 2 + 1]);
        tr.metres = tr.dist[i] + f * (tr.dist[i + 1] - tr.dist[i]);
        tr.climbed = tr.climb[i] + f * (tr.climb[i + 1] - tr.climb[i]);
        piece.push(tr.headX, tr.headY);
      } else {
        tr.headX = tr.xy[i * 2];
        tr.headY = tr.xy[i * 2 + 1];
        tr.metres = tr.dist[i];
        tr.climbed = tr.climb[i];
        tr.done = true;
        tr.doneAt = t;
      }
      if (piece.length < 4) continue;

      let bx0 = Infinity,
        by0 = Infinity,
        bx1 = -Infinity,
        by1 = -Infinity;
      for (let j = 0; j < piece.length; j += 2) {
        bx0 = Math.min(bx0, piece[j]);
        bx1 = Math.max(bx1, piece[j]);
        by0 = Math.min(by0, piece[j + 1]);
        by1 = Math.max(by1, piece[j + 1]);
      }
      if (bx0 === bx1 && by0 === by1) continue; // standing still

      const added = { xy: windows ? piece.slice() : piece, x0: bx0, y0: by0, x1: bx1, y1: by1 };
      if (windows) history.push(added);
      for (const level of levels) if (level) strokePiece(level, added);
    }
  }

  /** The map and heat at the camera's zoom, cross-fading between the two nearest levels. */
  function drawScene(index: number, zoom: number, tx: number, ty: number): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);
    const [a, b, frac] = levelsFor(zoom, levels.length - 1);
    if (windows && windowIndices) {
      for (const [i, level] of levels.entries()) {
        const active = i === a || i === b;
        const previous = windowIndices[i];
        if (active) {
          const entries = windows[i];
          while (entries[windowIndices[i] + 1]?.from <= index) windowIndices[i]++;
        }
        // Before opening replacements, so both are never held at once.
        if (level && (!active || previous !== windowIndices[i])) releaseLevel(i);
      }
      for (const i of a === b ? [a] : [a, b]) {
        if (levels[i]) continue;
        const { view, tiles } = windows[i][windowIndices[i]];
        const level = createLevel(view, tiles);
        for (const piece of history) strokePiece(level, piece);
        levels[i] = level;
      }
    }
    const drawLevel = (level: Level, alpha: number) => {
      flush(level);
      const s = zoom / level.k;
      ctx.setTransform(s, 0, 0, s, tx + level.ox * zoom, ty + level.oy * zoom);
      ctx.globalAlpha = alpha;
      ctx.drawImage(level.composed, 0, 0);
    };
    drawLevel(levels[a]!, 1);
    if (b !== a) drawLevel(levels[b]!, smoothstep(frac));
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** The text of every metric this video can show, at video time `t`. */
  function metricTexts(t: number): Map<Metric, string> {
    let started = 0;
    let moving = 0;
    let metres = 0;
    let climbed = 0;
    let date = prepared[0].date;
    for (const tr of prepared) {
      if (!tr.done) moving++;
      if (!tr.started) continue;
      started++;
      metres += tr.metres;
      climbed += tr.climbed;
      date = tr.date;
    }
    const lastSecond = (track: Track) => track.points[track.points.length - 1];
    const texts = new Map<Metric, string>();
    if (kind === 'single') {
      // One activity: its own elapsed time and distance so far.
      const elapsed = Math.floor(lastSecond(tracks[0]) * timeline.progress(0, t));
      texts.set('time', clockText(elapsed));
      texts.set('distance', `${(metres / 1000).toFixed(1)} km`);
      texts.set('pace', paceText(tracks[0].sport, elapsed, metres));
      texts.set('date', prepared[0].date);
    } else if (timeline.clock) {
      // All at once: one shared clock, and how many are still out.
      texts.set('time', clockText(Math.floor(timeline.clock(t))));
      texts.set('count', moving > 0 ? `${moving} still ${movingLabel}` : 'all finished');
      texts.set('distance', `${wholeNumber(metres / 1000)} km`);
    } else {
      if (metrics.includes('time')) {
        let seconds = 0;
        tracks.forEach((track, k) => (seconds += lastSecond(track) * timeline.progress(k, t)));
        texts.set('time', clockText(Math.floor(seconds)));
      }
      texts.set('date', timeline.label?.(t) ?? date);
      texts.set('count', `${started} ${started === 1 ? singular : plural}`);
      texts.set('distance', `${wholeNumber(metres / 1000)} km`);
    }
    if (hasElevation) texts.set('elevation', `↑${wholeNumber(climbed)} m`);
    return texts;
  }

  type Card = {
    /** The large value and the baseline it sits on. */
    headline: string;
    headlineY: number;
    /** The other values, on as many lines as the frame's width needs. */
    lines: string[];
    /** Lowest pixel row the card reaches. */
    bottom: number;
  };

  /** What the metrics card shows at video time `t` and where; null when there is no card. */
  function layoutCard(t: number): Card | null {
    const texts = metricTexts(t);
    const shown = metrics.flatMap((metric) => texts.get(metric) ?? []);
    if (shown.length === 0) return null;
    const [headline, ...rest] = shown;

    ctx.font = statusFont;
    const lines: string[] = [];
    for (const text of rest) {
      const last = lines[lines.length - 1];
      if (last === undefined) lines.push(text);
      else if (ctx.measureText(`${last}  ·  ${text}`).width > W - 2 * margin) lines.push(text);
      else lines[lines.length - 1] = `${last}  ·  ${text}`;
    }

    const below = lines.length > 0 ? statusGap + (lines.length - 1) * statusStep : 0;
    let headlineY: number;
    if (cardOnTop) {
      // Under the title when both are in the same corner.
      const underTitle = stacked ? 78 * unit * titleScale : 0;
      headlineY = H * 0.075 + underTitle;
    } else if (cardRow === 'middle') {
      // The large value and the lines under it, centred on the frame's middle.
      headlineY = H * 0.5 - below / 2 + 22 * unit * metricsScale;
    } else {
      // Raised when it has more lines, to stay clear of the bottom edge and the profile.
      headlineY = Math.min(H * 0.875, textFloor - below);
    }
    return { headline, headlineY, lines, bottom: headlineY + below + 14 * unit * metricsScale };
  }

  /**
   * The baseline the title sits on. At the top it keeps its place and a card in the same
   * corner goes under it; at the bottom it goes above a card in the same corner.
   */
  function titleY(card: Card | null): number {
    if (titleOnTop) return H * 0.075;
    if (card && stacked) return card.headlineY - (60 * metricsScale + 30 * titleScale) * unit;
    if (titleRow === 'middle') return H * 0.5 + 16 * unit * titleScale;
    return Math.min(H * 0.93, textFloor);
  }

  /**
   * The rows the title and the card take in the middle of the frame, with room for a shade
   * around them; null when neither sits in the middle.
   */
  function middleRows(
    card: Card | null,
    title: { y: number; top: number } | null,
  ): { top: number; bottom: number } | null {
    const rows: [number, number][] = [];
    if (card && cardRow === 'middle')
      rows.push([card.headlineY - 60 * unit * metricsScale, card.bottom]);
    if (title && titleRow === 'middle') rows.push([title.top, title.y + 12 * unit * titleScale]);
    if (rows.length === 0) return null;
    const room = H * 0.06;
    return {
      top: Math.min(...rows.map(([top]) => top)) - room,
      bottom: Math.max(...rows.map(([, bottom]) => bottom)) + room,
    };
  }

  const creditFont = `400 ${Math.round(19 * unit)}px ${fontFamily}`;

  function drawOverlay(t: number, zoom: number, tx: number, ty: number): void {
    const card = layoutCard(t);
    const title = options.title ? { y: titleY(card), top: 0 } : null;
    if (title) title.top = title.y - 44 * unit * titleScale;
    /**
     * Where the shade at the bottom starts: higher when the title sits down there, or the
     * card does above the profile.
     */
    let bottomStart =
      title && titleRow === 'bottom' ? Math.min(H * 0.76, title.top - H * 0.06) : H * 0.76;
    if (profile && card && cardRow === 'bottom')
      bottomStart = Math.min(bottomStart, card.headlineY - 60 * unit * metricsScale - H * 0.06);
    /** The rows text in the middle of the frame takes, with room around; null when none. */
    const middleBand = middleRows(card, title);
    if (attribution !== undefined) {
      if (bottomStart === H * 0.76) ctx.fillStyle = bottomShade;
      else {
        const shade = ctx.createLinearGradient(0, bottomStart, 0, bottomStart + H * 0.14);
        shade.addColorStop(0, 'rgba(5, 6, 9, 0)');
        shade.addColorStop(1, 'rgba(5, 6, 9, 0.88)');
        ctx.fillStyle = shade;
      }
      ctx.fillRect(0, bottomStart, W, H - bottomStart);
      if (card && cardOnTop) {
        // Dark behind the whole card, fading out below it.
        const shade = ctx.createLinearGradient(0, card.bottom, 0, card.bottom + H * 0.1);
        shade.addColorStop(0, 'rgba(5, 6, 9, 0.88)');
        shade.addColorStop(1, 'rgba(5, 6, 9, 0)');
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, W, card.bottom + H * 0.1);
      } else if (title && titleOnTop) {
        ctx.fillStyle = topShade;
        ctx.fillRect(0, 0, W, H * 0.12);
      }
      if (middleBand) {
        // Dark behind text in the middle, fading out above and below it.
        const { top, bottom } = middleBand;
        const shade = ctx.createLinearGradient(0, top, 0, bottom);
        shade.addColorStop(0, 'rgba(5, 6, 9, 0)');
        shade.addColorStop(0.3, 'rgba(5, 6, 9, 0.7)');
        shade.addColorStop(0.7, 'rgba(5, 6, 9, 0.7)');
        shade.addColorStop(1, 'rgba(5, 6, 9, 0)');
        ctx.fillStyle = shade;
        ctx.fillRect(0, top, W, bottom - top);
      }
      ctx.font = creditFont;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillText(attribution, W - W * 0.03, H - H * 0.012);

      // Place names sit above the routes so they stay readable on busy roads. Each zoom
      // level has its own selection; names fade as the camera moves between levels.
      const [a, b, frac] = levelsFor(zoom, levels.length - 1);
      const mix = smoothstep(frac);
      const visible = new Map<string, { x: number; y: number; size: number; alpha: number }>();
      const collect = (level: Level, weight: number) => {
        for (const label of level.labels) {
          const x = label.x * zoom + tx;
          const y = label.y * zoom + ty;
          if (x < -200 * unit || x > W + 200 * unit || y < 0 || y > H * 0.82) continue;
          const seen = visible.get(label.text);
          if (seen) seen.alpha = Math.min(1, seen.alpha + weight);
          else visible.set(label.text, { x, y, size: label.size, alpha: weight });
        }
      };
      collect(levels[a]!, b === a ? 1 : 1 - mix);
      if (b !== a) collect(levels[b]!, mix);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5 * unit;
      ctx.strokeStyle = 'rgba(6, 8, 12, 0.75)';
      ctx.fillStyle = 'rgba(214, 222, 236, 0.72)';
      const topLimit =
        card && cardOnTop ? card.bottom + H * 0.01 : H * (title && titleOnTop ? 0.09 : 0.02);
      const bottomLimit = Math.min(H * 0.8, bottomStart + H * 0.04);
      for (const [text, label] of visible) {
        // Fade names out before they reach the counters or the title.
        const nearBottom = clamp((bottomLimit - label.y) / (H * 0.04), 0, 1);
        const nearTop = clamp((label.y - topLimit) / (H * 0.03), 0, 1);
        // Names under text in the middle fade out too.
        const awayFromMiddle = middleBand
          ? clamp(
              Math.max(middleBand.top - label.y, label.y - middleBand.bottom) / (H * 0.03),
              0,
              1,
            )
          : 1;
        const alpha = label.alpha * nearBottom * nearTop * awayFromMiddle;
        if (alpha < 0.02) continue;
        ctx.globalAlpha = alpha;
        ctx.font = labelFont(label.size);
        ctx.strokeText(text, label.x, label.y);
        ctx.fillText(text, label.x, label.y);
      }
      ctx.globalAlpha = 1;
    }

    // Head dots
    ctx.globalCompositeOperation = 'lighter';
    for (const tr of prepared) {
      const a = headAlpha(tr, t);
      if (a === 0) continue;
      const x = tr.headX * zoom + tx;
      const y = tr.headY * zoom + ty;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, headRadius);
      glow.addColorStop(0, `rgba(255, 244, 230, ${(0.95 * a).toFixed(3)})`);
      glow.addColorStop(0.22, `rgba(255, 190, 130, ${(0.5 * a).toFixed(3)})`);
      glow.addColorStop(1, 'rgba(255, 120, 40, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, headRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    if (profile)
      drawElevationProfile(
        ctx,
        profile,
        profileBox,
        prepared.map((tr) => ({
          meters: tr.started ? tr.metres : 0,
          // One activity keeps its dot, also at the finish; several show theirs while moving.
          dot: kind === 'single' ? 1 : headAlpha(tr, t),
        })),
        unit,
      );

    ctx.textBaseline = 'alphabetic';
    if (options.title && title) {
      ctx.textAlign = titleSide;
      ctx.font = titleFont;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fillText(options.title, xOf(titleSide), title.y);
    }
    if (card) {
      const x = xOf(cardSide);
      ctx.textAlign = cardSide;
      ctx.font = headlineFont;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.fillText(card.headline, x, card.headlineY);
      ctx.font = statusFont;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      card.lines.forEach((line, i) =>
        ctx.fillText(line, x, card.headlineY + statusGap + i * statusStep),
      );
    }
    if (options.watermark) {
      // At the bottom left, on the map credit's line, as far from the edge as the credit
      // is on the right: the two never meet, whatever the credit's length.
      drawWatermark(ctx, W * 0.03, H - H * 0.012, unit, fontFamily);
    }
  }

  /** A copy of the replay's last frame, which the totals card is drawn over. */
  let lastReplayFrame: CanvasLike | null = null;
  /** A copy of the frame before the end card: the replay's last, or the totals card's. */
  let beforeEndCard: CanvasLike | null = null;
  /** A copy of what the frame canvas holds now. */
  const copyFrame = () => {
    const copy = createCanvas(W, H);
    (copy.getContext('2d') as Context2DLike).drawImage(frame, 0, 0);
    return copy;
  };

  /** The totals of every activity, for the totals card. */
  const totals = (): Totals => {
    let meters = 0;
    let climbed = 0;
    for (const tr of prepared) {
      meters += tr.dist[tr.count - 1];
      climbed += tr.climb[tr.count - 1];
    }
    return {
      activities: tracks.length,
      meters,
      movingSeconds: tracks.reduce((sum, track) => sum + movingSeconds(track), 0),
      climbed: hasElevation ? climbed : null,
    };
  };
  let totalsShown: Totals | null = null;

  return {
    canvas: frame,
    frameCount,
    replayFrames,
    heatSaturation: saturation,
    renderFrame(index: number): void {
      if (index !== nextFrame)
        throw new Error(`Frames must be rendered in order: expected ${nextFrame}, got ${index}`);
      if (onlyFrame !== undefined && index !== onlyFrame)
        throw new Error(`This renderer draws frame ${onlyFrame} only, not frame ${index}`);
      nextFrame++;
      if (index >= replayFrames) {
        // The end pause: the frame keeps the replay's last picture, drawn just before.
        if (index < replayFrames + pauseFrames) return;
        const after = index - replayFrames - pauseFrames;
        if (after < totalsFrames) {
          lastReplayFrame ??= copyFrame();
          totalsShown ??= totals();
          drawTotalsCard(ctx, lastReplayFrame, after / fps, totalsShown, {
            width: W,
            height: H,
            fontFamily,
            title: options.title ?? '',
            countLabel: [singular, plural],
          });
          return;
        }
        beforeEndCard ??= copyFrame();
        drawEndCard(ctx, beforeEndCard, (after - totalsFrames) / fps, {
          width: W,
          height: H,
          fontFamily,
        });
        return;
      }
      const t = index / fps;
      releaseLevelsBefore(index);
      advance(t);
      const [zoom, tx, ty] = camera
        ? [camera.zoom[index], camera.tx[index], camera.ty[index]]
        : [1, 0, 0];
      drawScene(index, zoom, tx, ty);
      drawOverlay(t, zoom, tx, ty);
    },
    skipTo(index: number): void {
      // The end card is drawn over the replay's last frame, so it cannot be skipped to.
      if (index < nextFrame || index >= replayFrames)
        throw new Error(`Cannot skip from frame ${nextFrame} to frame ${index}`);
      // The frames skipped show nothing, so only the levels shown from `index` on get routes.
      releaseLevelsBefore(index);
      for (; nextFrame < index; nextFrame++) advance(nextFrame / fps);
    },
  };
}
