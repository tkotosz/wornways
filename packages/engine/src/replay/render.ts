import { drawBasemap, type Basemap, type MapLabel, type Tile } from '../map/basemap.ts';
import { levelsFor, mapLevelViews, type CameraPath, type LevelWindow } from './camera.ts';
import { drawElevationProfile, elevationProfile } from './elevation-profile.ts';
import { WIDGET_SIZE, startingWidgets, valueLines, type Widget } from './widgets.ts';
import { END_CARD_S, drawEndCard, endCardFrames } from './end-card.ts';
import {
  AUTOMATIC_TOTALS,
  TOTALS_CARD_S,
  drawTotalsCard,
  startingTotalsWidgets,
  totalsCardFrames,
  totalsEntries,
  totalsValues,
  type Totals,
} from './totals-card.ts';
import { drawWatermark } from './mark.ts';
import { averagePace, isOnFoot, topSpeed } from './pace.ts';
import { dateRange } from './plans.ts';
import { composeHeat, createHeatRamp, decodeHeat, heatStyle, saturationFromHeat } from './heat.ts';
import { projectTrack, type Projected, type SensorSums } from './project.ts';
import type { Timeline } from './timeline.ts';
import type { SensorChannel, Track } from '../track/types.ts';
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
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
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
/**
 * A value the metrics card can show: the time so far (stops included) or moving, the
 * distance, the average pace, the top speed so far, the meters climbed or descended, the
 * highest point so far, the date, the start time (one activity), how many activities, the
 * days with an activity, or the longest activity so far.
 */
export type Metric =
  | 'time'
  | 'moving'
  | 'distance'
  | 'pace'
  | 'top-speed'
  | 'elevation'
  | 'descent'
  | 'highest'
  | 'date'
  | 'start'
  | 'count'
  | 'days'
  | 'longest'
  | 'heart-rate'
  | 'max-heart-rate'
  | 'power'
  | 'cadence'
  | 'temperature'
  | 'calories';
export const METRICS: readonly Metric[] = [
  'time',
  'moving',
  'distance',
  'pace',
  'top-speed',
  'elevation',
  'descent',
  'highest',
  'date',
  'start',
  'count',
  'days',
  'longest',
  'heart-rate',
  'max-heart-rate',
  'power',
  'cadence',
  'temperature',
  'calories',
];

/** A box of the frame, in fractions of its width and height, 0 to 1. */
export type FrameBox = { x: number; y: number; width: number; height: number };

/**
 * Where the last frame drew each widget over the replay, in the order of the widgets (null
 * for one with nothing to show), and the watermark.
 */
export type OverlayBoxes = { widgets: (FrameBox | null)[]; watermark?: FrameBox };

/**
 * A value as a widget shows it: its number ("1,147 km"), its words ("distance", none for a
 * date), and for some a short form with the words folded in ("↑1,200 m").
 */
export type MetricValue = { value: string; label: string; short?: string };

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
   * What is drawn over the replay (see widgets.ts). Without it, the title at the top, the
   * values that suit the video at the bottom left (see `defaultMetrics`; a value the video
   * cannot show is left out), and for a single activity the elevation chart along the bottom.
   */
  widgets?: Widget[];
  /**
   * Lay the widgets out and report where they go, but leave them off the picture: for an
   * editor that draws them over the still itself, so they move without a redraw.
   */
  hideWidgets?: boolean;
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
  /** What the totals card shows; default `startingTotalsWidgets` (see totals-card.ts). */
  totalsWidgets?: Widget[];
  /** Lay out the totals card's widgets but leave them off it, as `hideWidgets` does. */
  hideTotalsWidgets?: boolean;
  /** Draw the small Wornways mark on the map credit's line. Default false. */
  watermark?: boolean;
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
  /**
   * Draws a card as it stands once finished, over the frame drawn last (the replay's last
   * frame), for a still of the video's ending: the totals card with every value counted up,
   * or the end card with its mark and name.
   */
  drawFinishedCard(card: 'totals' | 'end'): void;
  /** Where the replay frame drawn last put each widget and the watermark. */
  overlayBoxes(): OverlayBoxes;
  /** The widgets drawn: the ones given, or the ones the other options describe. */
  readonly widgets: Widget[];
  /**
   * The totals card's widgets (the ones given, or the ones it starts with) and each value it
   * can show, for arranging them.
   */
  totalsCard(): { widgets: Widget[]; values: Map<Metric, MetricValue> };
  /** Each value this video can show, as it stands at the end of the replay. */
  readonly finalValues: Map<Metric, MetricValue>;
  /**
   * The climb profile's shape, for drawing it elsewhere: `samples` heights from 0 (its
   * lowest) to 1 (its highest); null when no activity recorded elevation.
   */
  profileShape(samples: number): number[] | null;
};

/** Where an activity stands, for the values: as drawn so far, or at the end. */
type MetricState = Pick<
  Prepared,
  | 'date'
  | 'hasElevation'
  | 'started'
  | 'done'
  | 'metres'
  | 'climbed'
  | 'descended'
  | 'highest'
  | 'moved'
  | 'topSpeed'
  | 'sensorsNow'
>;

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
  /** Metres descended so far. */
  descended: number;
  /** The highest elevation reached so far. */
  highest: number;
  /** Seconds moving so far. */
  moved: number;
  /** The top speed so far, in meters per second. */
  topSpeed: number;
  /** Each recorded sensor channel's running sums so far (see `SensorSums`). */
  sensorsNow: Partial<Record<SensorChannel, { total: number; time: number; max: number }>>;
  started: boolean;
  done: boolean;
  /** Video time at which the track finished drawing. */
  doneAt: number;
};

/** A track's recorded sensor channels with their running sums. */
const sensorEntries = (projected: Projected) =>
  Object.entries(projected.sensors) as [SensorChannel, SensorSums][];

/**
 * A sensor channel's text: heart rate, power, cadence (doubled into steps on foot) or
 * temperature, from its average over time or its highest value.
 */
/** A sensor value as a widget shows it: the number with its unit, and its words. */
function sensorText(metric: Metric, value: number, onFoot: boolean): [string, string, string] {
  const whole = Math.round(value);
  if (metric === 'heart-rate') return [`${whole} bpm`, 'average heart rate', `${whole} bpm avg`];
  if (metric === 'max-heart-rate') return [`${whole} bpm`, 'max heart rate', `${whole} bpm max`];
  if (metric === 'power') return [`${whole} W`, 'average power', `${whole} W avg`];
  if (metric === 'cadence') {
    const steps = Math.round(value * 2);
    return onFoot
      ? [`${steps} spm`, 'average cadence', `${steps} spm avg`]
      : [`${whole} rpm`, 'average cadence', `${whole} rpm avg`];
  }
  return [`${whole} °C`, 'average temperature', `${whole} °C avg`];
}

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

/** Average pace ("5:32 /km") or, off foot, speed ("24.3 km/h") over the distance so far. */
function paceText(onFoot: boolean, seconds: number, metres: number): string {
  const { value, unit } = averagePace(onFoot, seconds, metres);
  return `${value} ${unit}`;
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
  const unit = Math.min(W, H) / 1080; // scales strokes and type with the output size
  const withCalories = tracks.some((track) => track.calories !== undefined);
  // Pace is in minutes per kilometer only when every activity is on foot.
  const onFoot = tracks.every((track) => isOnFoot(track.sport));
  const starts = tracks.map((track) => track.startTime);
  /** The days the activities span: "18–22 Apr 2026", or one day. */
  const datesSpanned = dateRange(Math.min(...starts), Math.max(...starts));
  /** The time of day an activity started, e.g. "06:42", in this device's time zone. */
  const timeFormat = new Intl.DateTimeFormat(options.locale ?? 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
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
    descended: 0,
    highest: 0,
    moved: 0,
    topSpeed: 0,
    sensorsNow: {},
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
  // A gradient that darkens the map at the bottom, behind the map credit.
  const bottomShade = ctx.createLinearGradient(0, H * 0.76, 0, H * 0.9);
  bottomShade.addColorStop(0, 'rgba(5, 6, 9, 0)');
  bottomShade.addColorStop(1, 'rgba(5, 6, 9, 0.88)');

  // The widgets over the replay (see widgets.ts). Their sizes at 100%, in pixels.
  const margin = W * 0.07;
  const TEXT_SIZE = 44 * unit; // a text widget's letters
  const VALUE_SIZE = 52 * unit; // a value's number
  const LABEL_SIZE = 24 * unit; // the words under a value
  const CHART_HEIGHT = 80 * unit;
  const fontOf = (weight: number, px: number) => `${weight} ${Math.round(px)}px ${fontFamily}`;
  const hasElevation = prepared.some((tr) => tr.hasElevation);

  /** Each value as it stands at the end of the replay, for laying widgets out. */
  const finalValues = metricValues(timeline.duration, finished());
  const startValues = metricValues(0);
  /** The widgets set, else the ones a video starts with. */
  const widgets: Widget[] =
    options.widgets ??
    startingWidgets(
      {
        title: !!options.title,
        metrics: defaultMetrics(kind).filter((m) => finalValues.has(m)),
        elevationChart: kind === 'single' && hasElevation,
      },
      // As wide as a value gets: at the finish, or at the start for one that shrinks, such as
      // a race's "25 still moving", which ends as "all finished".
      (widget) => {
        const end = widgetPixels(widget, finalValues);
        const start = widgetPixels(widget, startValues);
        return { width: Math.max(end.width, start.width) / W, height: end.height / H };
      },
    ).map((widget) => ({
      ...widget,
      size: clamp(Math.round(widget.size), WIDGET_SIZE.min, WIDGET_SIZE.max),
    }));
  // The climb profile, sampled for the widest a chart is drawn.
  const profile = widgets.some((widget) => widget.kind === 'elevation-chart')
    ? elevationProfile(
        tracks,
        Math.round(Math.min(600, Math.max(50, (W - 2 * margin) / (3 * unit)))),
      )
    : null;

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
        const between = (values: Float64Array) => values[i] + f * (values[i + 1] - values[i]);
        tr.metres = between(tr.dist);
        tr.climbed = between(tr.climb);
        tr.descended = between(tr.descent);
        tr.highest = between(tr.top);
        tr.moved = between(tr.moving);
        tr.topSpeed = between(tr.fastest);
        for (const [channel, sums] of sensorEntries(tr))
          tr.sensorsNow[channel] = {
            total: between(sums.total),
            time: between(sums.time),
            max: between(sums.max),
          };
        piece.push(tr.headX, tr.headY);
      } else {
        tr.headX = tr.xy[i * 2];
        tr.headY = tr.xy[i * 2 + 1];
        tr.metres = tr.dist[i];
        tr.climbed = tr.climb[i];
        tr.descended = tr.descent[i];
        tr.highest = tr.top[i];
        tr.moved = tr.moving[i];
        tr.topSpeed = tr.fastest[i];
        for (const [channel, sums] of sensorEntries(tr))
          tr.sensorsNow[channel] = { total: sums.total[i], time: sums.time[i], max: sums.max[i] };
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
  /**
   * Each value at video time `t`: its number and the words under it. `state` is where every
   * activity stands: as drawn so far, or at the end (`finished`).
   */
  function metricValues(t: number, state: MetricState[] = prepared): Map<Metric, MetricValue> {
    let started = 0;
    let moving = 0;
    let metres = 0;
    let climbed = 0;
    let descended = 0;
    let highest = -Infinity;
    let moved = 0;
    let longest = 0;
    let fastest = 0;
    const days = new Set<string>();
    let date = state[0]!.date;
    for (const tr of state) {
      if (!tr.done) moving++;
      if (!tr.started) continue;
      started++;
      metres += tr.metres;
      climbed += tr.climbed;
      descended += tr.descended;
      if (tr.hasElevation) highest = Math.max(highest, tr.highest);
      moved += tr.moved;
      longest = Math.max(longest, tr.metres);
      fastest = Math.max(fastest, tr.topSpeed);
      days.add(tr.date);
      date = tr.date;
    }
    const lastSecond = (track: Track) => track.points[track.points.length - 1];
    /** The activities' recorded time so far, added up. */
    const secondsSoFar = () =>
      tracks.reduce((sum, track, k) => sum + lastSecond(track) * timeline.progress(k, t), 0);
    const texts = new Map<Metric, MetricValue>();
    const set = (metric: Metric, value: string, label: string, short?: string) =>
      texts.set(metric, short === undefined ? { value, label } : { value, label, short });
    if (kind === 'single') {
      // One activity: its own elapsed time and distance so far.
      const elapsed = Math.floor(lastSecond(tracks[0]) * timeline.progress(0, t));
      set('time', clockText(elapsed), 'time');
      set('distance', `${(metres / 1000).toFixed(1)} km`, 'distance');
      set('pace', paceText(onFoot, elapsed, metres), onFoot ? 'average pace' : 'average speed');
      set('date', state[0]!.date, '');
      set('start', timeFormat.format(tracks[0].startTime), 'start');
    } else if (timeline.clock) {
      // All at once: one shared clock, and how many are still out.
      set('time', clockText(Math.floor(timeline.clock(t))), 'time');
      if (moving > 0) set('count', String(moving), `still ${movingLabel}`);
      else set('count', 'all', 'finished');
      set('distance', `${wholeNumber(metres / 1000)} km`, 'distance');
      set('date', datesSpanned, '');
      set(
        'pace',
        paceText(onFoot, secondsSoFar(), metres),
        onFoot ? 'average pace' : 'average speed',
      );
    } else {
      const seconds = secondsSoFar();
      set('time', clockText(Math.floor(seconds)), 'time');
      set('pace', paceText(onFoot, seconds, metres), onFoot ? 'average pace' : 'average speed');
      set('date', timeline.label?.(t) ?? date, '');
      set('count', String(started), started === 1 ? singular : plural);
      set('distance', `${wholeNumber(metres / 1000)} km`, 'distance');
    }
    set('moving', clockText(Math.floor(moved)), 'moving');
    // Sensor channels: averages over time, the highest heart rate, and calories so far.
    const sensorSums = new Map<SensorChannel, { total: number; time: number; max: number }>();
    for (const tr of state) {
      if (!tr.started) continue;
      for (const [channel, now] of Object.entries(tr.sensorsNow) as [
        SensorChannel,
        { total: number; time: number; max: number },
      ][]) {
        const sum = sensorSums.get(channel) ?? { total: 0, time: 0, max: 0 };
        sensorSums.set(channel, {
          total: sum.total + now.total,
          time: sum.time + now.time,
          max: Math.max(sum.max, now.max),
        });
      }
    }
    const averages: [Metric, SensorChannel][] = [
      ['heart-rate', 'heartRate'],
      ['power', 'power'],
      ['cadence', 'cadence'],
      ['temperature', 'temperature'],
    ];
    for (const [metric, channel] of averages) {
      const sum = sensorSums.get(channel);
      if (sum && sum.time > 0) set(metric, ...sensorText(metric, sum.total / sum.time, onFoot));
    }
    const heart = sensorSums.get('heartRate');
    if (heart && heart.max > 0)
      set('max-heart-rate', ...sensorText('max-heart-rate', heart.max, onFoot));
    if (withCalories)
      set(
        'calories',
        `${wholeNumber(tracks.reduce((sum, track, k) => sum + (track.calories ?? 0) * timeline.progress(k, t), 0))} kcal`,
        'calories',
      );
    const top = topSpeed(onFoot, fastest);
    set(
      'top-speed',
      `${top.value} ${top.unit}`,
      top.unit === '/km' ? 'best pace' : 'top speed',
      top.unit === '/km' ? `best ${top.value} /km` : `max ${top.value} km/h`,
    );
    if (kind !== 'single') {
      set('days', String(days.size), days.size === 1 ? 'day out' : 'days out');
      const km = wholeNumber(longest / 1000);
      set('longest', `${km} km`, 'longest', `longest ${km} km`);
    }
    if (hasElevation) {
      set('elevation', `${wholeNumber(climbed)} m`, 'climbed', `↑${wholeNumber(climbed)} m`);
      set('descent', `${wholeNumber(descended)} m`, 'descended', `↓${wholeNumber(descended)} m`);
      if (Number.isFinite(highest))
        set(
          'highest',
          `${wholeNumber(highest)} m`,
          'highest point',
          `top ${wholeNumber(highest)} m`,
        );
    }
    return texts;
  }

  /** Where every activity stands once the replay has finished, for `metricValues`. */
  function finished(): MetricState[] {
    return prepared.map((tr) => {
      const last = tr.count - 1;
      const sensorsNow: MetricState['sensorsNow'] = {};
      for (const [channel, sums] of sensorEntries(tr))
        sensorsNow[channel] = {
          total: sums.total[last]!,
          time: sums.time[last]!,
          max: sums.max[last]!,
        };
      return {
        date: tr.date,
        hasElevation: tr.hasElevation,
        started: true,
        done: true,
        metres: tr.dist[last]!,
        climbed: tr.climb[last]!,
        descended: tr.descent[last]!,
        highest: tr.top[last]!,
        moved: tr.moving[last]!,
        topSpeed: tr.fastest[last]!,
        sensorsNow,
      };
    });
  }

  /** A widget's width and height in pixels, with the values it would show. */
  function widgetPixels(
    widget: Widget,
    values: Map<Metric, MetricValue>,
  ): { width: number; height: number } {
    const scale = widget.size / 100;
    if (widget.kind === 'elevation-chart')
      return { width: Math.min(W, (W - 2 * margin) * scale), height: CHART_HEIGHT * scale };
    if (widget.kind === 'text') {
      const text = widget.text ?? options.title ?? '';
      if (!text) return { width: 0, height: 0 };
      ctx.font = fontOf(600, TEXT_SIZE * scale);
      return { width: ctx.measureText(text).width, height: TEXT_SIZE * scale * 1.27 };
    }
    const value = values.get(widget.metric);
    if (!value) return { width: 0, height: 0 };
    const { line, under } = valueLines(value, widget.label);
    ctx.font = fontOf(600, VALUE_SIZE * scale);
    let width = ctx.measureText(line).width;
    let height = VALUE_SIZE * scale * 1.1;
    if (under) {
      ctx.font = fontOf(400, LABEL_SIZE * scale);
      width = Math.max(width, ctx.measureText(under).width);
      height += LABEL_SIZE * scale * 1.3;
    }
    return { width, height };
  }

  /** Where each widget sits at video time `t`, in pixels; null for one with nothing to show. */
  function layoutWidgets(values: Map<Metric, MetricValue>): (Rect | null)[] {
    return widgets.map((widget) => {
      const { width, height } = widgetPixels(widget, values);
      if (width === 0) return null;
      const cx = (widget.x / 100) * W;
      const cy = (widget.y / 100) * H;
      return { x0: cx - width / 2, y0: cy - height / 2, x1: cx + width / 2, y1: cy + height / 2 };
    });
  }

  /**
   * Draws one widget in its box: text, a value with its words, or the climb profile. Text has
   * a soft shadow around its letters, so it reads on a busy map without darkening the frame.
   */
  function drawWidget(widget: Widget, box: Rect, values: Map<Metric, MetricValue>, t: number) {
    const scale = widget.size / 100;
    const cx = (box.x0 + box.x1) / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 14 * unit * scale;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2 * unit * scale;
    if (widget.kind === 'text') {
      ctx.font = fontOf(600, TEXT_SIZE * scale);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fillText(widget.text ?? options.title ?? '', cx, box.y0 + TEXT_SIZE * scale);
    } else if (widget.kind === 'metric') {
      const { line, under } = valueLines(values.get(widget.metric)!, widget.label);
      ctx.font = fontOf(600, VALUE_SIZE * scale);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.fillText(line, cx, box.y0 + VALUE_SIZE * scale * 0.95);
      if (under) {
        ctx.font = fontOf(400, LABEL_SIZE * scale);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.66)';
        ctx.fillText(under, cx, box.y0 + VALUE_SIZE * scale * 1.1 + LABEL_SIZE * scale);
      }
    } else if (profile) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0)';
      drawElevationProfile(
        ctx,
        profile,
        { x: box.x0, y: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0 },
        prepared.map((tr) => ({
          meters: tr.started ? tr.metres : 0,
          // One activity keeps its dot, also at the finish; several show theirs while moving.
          dot: kind === 'single' ? 1 : headAlpha(tr, t),
        })),
        unit * scale,
      );
    }
    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  const creditFont = `400 ${Math.round(19 * unit)}px ${fontFamily}`;

  function drawOverlay(t: number, zoom: number, tx: number, ty: number): void {
    const values = metricValues(t);
    const layout = layoutWidgets(values);
    /** Where text widgets sit, with room around: place names fade under them. */
    const room = 10 * unit;
    const textBoxes = layout.flatMap((box, k) =>
      box && widgets[k]!.kind !== 'elevation-chart'
        ? [{ x0: box.x0 - room, y0: box.y0 - room, x1: box.x1 + room, y1: box.y1 + room }]
        : [],
    );
    if (attribution !== undefined) {
      // Dark at the bottom, behind the map credit.
      ctx.fillStyle = bottomShade;
      ctx.fillRect(0, H * 0.76, W, H * 0.24);
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
      for (const [text, label] of visible) {
        // Fade names out near the bottom, the top, and under text.
        const nearBottom = clamp((H * 0.8 - label.y) / (H * 0.04), 0, 1);
        const nearTop = clamp((label.y - H * 0.02) / (H * 0.03), 0, 1);
        const awayFromText = Math.min(
          1,
          ...textBoxes.map((box) =>
            clamp(
              Math.max(box.y0 - label.y, label.y - box.y1, box.x0 - label.x, label.x - box.x1) /
                (H * 0.02),
              0,
              1,
            ),
          ),
        );
        const alpha = label.alpha * nearBottom * nearTop * awayFromText;
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

    /** A box in pixels as fractions of the frame. */
    const frameBox = (box: Rect): FrameBox => ({
      x: box.x0 / W,
      y: box.y0 / H,
      width: (box.x1 - box.x0) / W,
      height: (box.y1 - box.y0) / H,
    });
    widgets.forEach((widget, k) => {
      const box = layout[k];
      if (box && !options.hideWidgets) drawWidget(widget, box, values, t);
    });
    boxes = { widgets: layout.map((box) => (box ? frameBox(box) : null)) };
    if (options.watermark) {
      // At the bottom left, on the map credit's line, as far from the edge as the credit
      // is on the right: the two never meet, whatever the credit's length.
      const left = W * 0.03;
      const baseline = H - H * 0.012;
      const mark = drawWatermark(ctx, left, baseline, unit, fontFamily);
      boxes.watermark = frameBox({
        x0: left,
        y0: baseline - mark.height,
        x1: left + mark.width,
        y1: baseline,
      });
    }
  }
  /** Where `drawOverlay` put each widget and the watermark, for `overlayBoxes`. */
  let boxes: OverlayBoxes = { widgets: [] };

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
    let descended = 0;
    let highest = -Infinity;
    let moving = 0;
    let longest = 0;
    let fastest = 0;
    for (const tr of prepared) {
      const last = tr.count - 1;
      fastest = Math.max(fastest, tr.fastest[last]);
      meters += tr.dist[last];
      climbed += tr.climb[last];
      descended += tr.descent[last];
      if (tr.hasElevation) highest = Math.max(highest, tr.top[last]);
      moving += tr.moving[last];
      longest = Math.max(longest, tr.dist[last]);
    }
    return {
      activities: tracks.length,
      meters,
      movingSeconds: moving,
      totalSeconds: tracks.reduce(
        (sum, track) => sum + (track.elapsedSeconds ?? track.points[track.points.length - 1]),
        0,
      ),
      climbed: hasElevation ? climbed : null,
      descended: hasElevation ? descended : null,
      highest: hasElevation ? highest : null,
      onFoot,
      dates: datesSpanned,
      days: new Set(prepared.map((tr) => tr.date)).size,
      longest,
      topSpeed: fastest,
      ...sensorTotals(),
      calories: withCalories ? tracks.reduce((sum, track) => sum + (track.calories ?? 0), 0) : null,
    };
  };
  /** Each sensor channel over every activity that recorded it: averages, highest heart rate. */
  const sensorTotals = () => {
    const average = (channel: SensorChannel) => {
      let total = 0;
      let time = 0;
      for (const tr of prepared) {
        const sums = tr.sensors[channel];
        if (!sums) continue;
        total += sums.total[tr.count - 1];
        time += sums.time[tr.count - 1];
      }
      return time > 0 ? total / time : null;
    };
    const maxes = prepared.flatMap((tr) => {
      const sums = tr.sensors.heartRate;
      return sums ? [sums.max[tr.count - 1]] : [];
    });
    return {
      heartRate: average('heartRate'),
      maxHeartRate: maxes.length ? Math.max(...maxes) : null,
      power: average('power'),
      cadence: average('cadence'),
      temperature: average('temperature'),
    };
  };
  let totalsShown: Totals | null = null;
  /** The totals card's widgets: the ones given, else the title and the usual values. */
  let totalsLayout: Widget[] | null = null;
  const totalsWidgets = (): Widget[] =>
    (totalsLayout ??=
      options.totalsWidgets ??
      startingTotalsWidgets(
        totalsEntries(totals(), 1, [singular, plural], AUTOMATIC_TOTALS).map((e) => e.field),
        !!options.title,
        { width: W, height: H },
      ));

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
            widgets: totalsWidgets(),
            hideWidgets: options.hideTotalsWidgets,
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
    drawFinishedCard(card: 'totals' | 'end'): void {
      const base = copyFrame();
      if (card === 'totals')
        drawTotalsCard(ctx, base, TOTALS_CARD_S, totals(), {
          width: W,
          height: H,
          fontFamily,
          title: options.title ?? '',
          countLabel: [singular, plural],
          widgets: totalsWidgets(),
          hideWidgets: options.hideTotalsWidgets,
        });
      else drawEndCard(ctx, base, END_CARD_S, { width: W, height: H, fontFamily });
    },
    overlayBoxes: () => boxes,
    widgets,
    totalsCard: () => ({
      widgets: totalsWidgets(),
      values: totalsValues(totals(), [singular, plural]) as Map<Metric, MetricValue>,
    }),
    finalValues,
    profileShape(samples: number) {
      const shape = hasElevation ? elevationProfile(tracks, samples) : null;
      if (!shape) return null;
      const span = shape.high - shape.low || 1;
      return [...shape.elevation].map((meters) => (meters - shape.low) / span);
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
