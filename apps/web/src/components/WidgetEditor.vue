<script setup lang="ts">
// Arranging the widgets over the still of the video's last frame, as stickers are arranged in
// a story editor. The still is drawn without them; the page draws them over it, at the sizes
// the engine draws them in the video (text, a value with its words, the elevation chart), so
// they move under the finger at once and nothing is drawn again while they are arranged.
//
// A tap picks a widget: the one under the finger, else the nearest within a finger's reach, so
// a fingertip need not land on a small widget exactly. A picked one has an outline and a
// corner handle. Dragging moves it, centered on where it is let go; it snaps to the frame's
// center lines and in line with the other widgets (their edges, and across their middles),
// with a line shown. Two fingers, or the corner handle, resize it. A tap on a picked text widget asks for its text (`edit`).
// The keyboard moves a picked widget with the arrow keys, resizes it with + and -, and
// removes it with Delete. On a story-shaped frame, while a widget moves, guides show the
// parts the platforms' own controls cover. Adding widgets, and a picked one's options, are in
// the strip under the picture (WidgetStrip).
//
// With `card`, the widgets are the totals card's: drawn at the card's sizes, a text with the
// orange rule under it, without the shadow.
import {
  WIDGET_SIZE,
  chartColors,
  chartIcon,
  defaultChartColor,
  iconOf,
  labelTextOf,
  valueLines,
  arrangeInLayout,
  layoutSlots,
  type ChartKind,
  type LayoutName,
  type Metric,
  type MetricValue,
  type Widget,
} from '@wornways/engine';
import { computed, ref } from 'vue';
import { widgetLabel } from '../adjust.ts';
import StatIcon from './StatIcon.vue';

const props = defineProps<{
  widgets: Widget[];
  /** Each value as it stands at the end, which the still shows. */
  values: Map<Metric, MetricValue>;
  /** The video's title, which a text widget without its own text shows. */
  title: string;
  /** Each chart's shape, values from 0 to 1, for the charts on the picture. */
  profiles: Partial<Record<ChartKind, number[]>>;
  /** The video's frame, in pixels: the widgets are sized as the engine sizes them in it. */
  size: { width: number; height: number };
  /** Whether the widgets are the totals card's, drawn as the card draws them. */
  card?: boolean;
  /**
   * The layout the widgets are arranged in: its slots show as guides (never in the video), and
   * the widgets snap to their edges and middles.
   */
  layout?: LayoutName;
  /** Whether the layout's slots show, and the widgets snap to them. */
  guides?: boolean;
}>();
/** The layout's slots on this frame; none without a layout. */
const slots = computed(() => (props.layout ? layoutSlots(props.layout, props.size) : []));
/** The picked widget's index; null when none is. */
const selected = defineModel<number | null>('selected', { required: true });
const emit = defineEmits<{
  /** The widgets after a change: moved, resized or removed. */
  change: [widgets: Widget[]];
  /** A picked text widget was tapped: its text is asked for. */
  edit: [index: number];
}>();

/** The widget being moved or resized, where it is now: its point and size. */
const moving = ref<{
  index: number;
  x: number;
  y: number;
  size: number;
  /** A chart's height, when it has one apart from its width. */
  height?: number;
} | null>(null);
/** The lines the moving widget snapped to, in percent of the frame; null for none. */
const snap = ref<{ x: number | null; y: number | null }>({ x: null, y: null });

/** Each widget as it shows: moving, or where it is. */
const shown = computed(() =>
  props.widgets.map((widget, index) =>
    moving.value?.index === index ? { ...widget, ...moving.value } : widget,
  ),
);

/**
 * A frame pixel of the engine's in width units of the picture (cqw): its sizes are for a
 * frame whose shorter side is 1080 pixels, scaled to the frame's.
 */
const unit = computed(
  () => (Math.min(props.size.width, props.size.height) / 1080 / props.size.width) * 100,
);

/** The text a widget shows: its line and the words above and under it; nothing for the chart. */
function textOf(widget: Widget): { above: string; line: string; under: string } | null {
  if (widget.kind === 'text') return { above: '', line: widget.text ?? props.title, under: '' };
  if (widget.kind === 'metric') {
    const value = props.values.get(widget.metric);
    return value
      ? valueLines(value, widget.label, widget.format, widget.labelText, widget.unit)
      : { above: '', line: '…', under: widgetLabel(widget, props.values) };
  }
  return null;
}

/**
 * On the totals card, a value with its words on its line: smaller and in orange, before or
 * after its number, as the card draws them. Null for any other.
 */
function besideOf(widget: Widget): { before: string; number: string; after: string } | null {
  if (!props.card || widget.kind !== 'metric') return null;
  if (widget.label !== 'before' && widget.label !== 'after') return null;
  const value = props.values.get(widget.metric);
  const words = value ? labelTextOf(value, widget.labelText, widget.format) : '';
  if (!value || !words) return null;
  const number = valueLines(value, 'off', widget.format, undefined, widget.unit).line;
  return widget.label === 'before'
    ? { before: words, number, after: '' }
    : { before: '', number, after: words };
}

/** A chart widget's colors: its own, else its chart's. */
const colorsOf = (widget: Widget & { kind: 'chart' }) =>
  chartColors(widget.color ?? defaultChartColor(widget.chart));

/** A chart's outline over its box, 100 wide and 100 high, as the engine draws it. */
function chartPath(chart: ChartKind): string {
  const shape = props.profiles[chart];
  if (!shape || shape.length < 2) return '';
  const points = shape.map(
    (v, k) => `${((k / (shape.length - 1)) * 100).toFixed(2)},${(100 - (14 + 86 * v)).toFixed(2)}`,
  );
  return `M0,100 L${points.join(' L')} L100,100 Z`;
}

/** How near a line, in pixels on the screen, a widget's edge or middle snaps to it. */
const SNAP_PX = 7;

/**
 * What of a widget's outline others line up with, in percent of the frame: across its left
 * edge, middle and right edge (for columns); down its top and bottom (for rows), not its
 * middle, which falls between a value's number and its words.
 */
type Edges = { x: number[]; y: number[] };

/**
 * Where the moving widget snaps, along one direction: of its own snap points (`own`, as
 * offsets from its point, see `Edges`), the one nearest a line within `reach`; the shift that
 * puts it on the line, and the line.
 */
function snapTo(
  at: number,
  own: number[],
  lines: number[],
  reach: number,
): { shift: number; line: number } | null {
  let best: { shift: number; line: number } | null = null;
  for (const line of lines)
    for (const offset of own) {
      const shift = line - (at + offset);
      if (Math.abs(shift) <= reach && (!best || Math.abs(shift) < Math.abs(best.shift)))
        best = { shift, line };
    }
  return best;
}
const layer = ref<HTMLElement | null>(null);

const round = (n: number) => Math.round(n * 10) / 10;
const sizeIn = (size: number) =>
  Math.round(Math.min(WIDGET_SIZE.max, Math.max(WIDGET_SIZE.min, size)));

function update(index: number, changed: Partial<Widget>): void {
  emit(
    'change',
    props.widgets.map((widget, k) =>
      k === index ? ({ ...widget, ...changed } as Widget) : widget,
    ),
  );
}

function remove(index: number): void {
  selected.value = null;
  emit(
    'change',
    props.widgets.filter((_, k) => k !== index),
  );
}

/** The fingers down, for two-finger resizing. */
const pointers = new Map<number, { x: number; y: number }>();
/** Whether a widget is held: a finger down now joins it, as the second of two. */
let holding = false;

/**
 * What a hold does: move the widget; resize it from its corner, growing right and down with
 * its top left corner in place; or resize a chart from one edge, the edge across from it in
 * place. Two fingers resize it evenly about its point.
 */
type Hold = 'move' | 'corner' | 'left' | 'right' | 'top' | 'bottom';

/**
 * One way of a widget, in percent of the frame: its point, and half of it, what scales (its
 * drawing) apart from what does not (its outline's padding).
 */
type Along = { at: number; half: number; pad: number };

/**
 * A resize from one edge, the edge across from it in place: `dir` is the way the edge held
 * moves out (1 right or down, -1 left or up) and `k` the scale the finger asks for. The edge
 * snaps to the nearest of `lines` within `reach`; the scale, kept within `limits`, and the line
 * it snapped to.
 */
function scaleFromEdge(
  along: Along,
  dir: 1 | -1,
  k: number,
  lines: number[],
  reach: number,
  limits: [number, number],
): { k: number; line: number | null; gap: number } {
  const fixed = along.at - dir * (along.half + along.pad);
  let best: { k: number; line: number; gap: number } | null = null;
  for (const line of lines) {
    const target = ((dir * (line - fixed)) / 2 - along.pad) / along.half;
    const gap = Math.abs(target - k) * 2 * along.half;
    if (target > 0 && gap <= reach && (!best || gap < best.gap)) best = { k: target, line, gap };
  }
  const wanted = best?.k ?? k;
  const kept = Math.min(limits[1], Math.max(limits[0], wanted));
  return { k: kept, line: best && kept === wanted ? best.line : null, gap: best?.gap ?? Infinity };
}

/** Where the point of a widget resized by `k` from one edge goes, the edge across in place. */
const pointAfter = (along: Along, dir: 1 | -1, k: number) =>
  along.at - dir * (along.half + along.pad) + dir * (along.half * k + along.pad);

/**
 * How much to scale by so an edge snaps: of the lines (`lines`), the one an edge of a widget
 * centered on `at` comes nearest to when scaled by `k`, within `reach`; the scale that puts
 * the edge on the line, and the line. Half the widget is `half` of what scales and `pad` of
 * its outline's padding, which does not (all in percent of the frame). Both edges move, as the
 * widget stays centered on its point.
 */
function snapScale(
  at: number,
  { half, pad }: { half: number; pad: number },
  k: number,
  lines: number[],
  reach: number,
): { k: number; line: number } | null {
  if (!(half > 0)) return null;
  let best: { k: number; line: number; gap: number } | null = null;
  for (const line of lines) {
    const target = (Math.abs(line - at) - pad) / half;
    const gap = Math.abs(target - k) * half;
    if (target > 0 && gap <= reach && (!best || gap < best.gap)) best = { k: target, line, gap };
  }
  return best && { k: best.k, line: best.line };
}

/** Starts a hold on a widget: moving it, or resizing it from a handle (see `Hold`). */
function start(event: PointerEvent, index: number, hold: Hold): void {
  if (event.button !== 0 || !layer.value) return;
  event.preventDefault();
  event.stopPropagation();
  const surface = layer.value;
  // A second finger while one is down: the drag under way turns into resizing.
  if (holding) {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    surface.setPointerCapture(event.pointerId);
    return;
  }
  // A new hold: no finger is left from one before, whatever the browser told of it.
  pointers.clear();
  holding = true;
  const widget = props.widgets[index]!;
  const height0 = widget.kind === 'chart' ? (widget.height ?? widget.size) : widget.size;
  const wasPicked = selected.value === index;
  selected.value = index;
  const area = surface.getBoundingClientRect();
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const [x0, y0] = [event.clientX, event.clientY];
  // The widget's own edges as offsets from its point, and the other widgets' edges and
  // middles, which it lines up with, in percent of the frame.
  const edgesOf = (element: Element): Edges => {
    const box = element.getBoundingClientRect();
    const x = (px: number) => ((px - area.left) / area.width) * 100;
    const y = (px: number) => ((px - area.top) / area.height) * 100;
    return {
      x: [x(box.left), x((box.left + box.right) / 2), x(box.right)],
      y: [y(box.top), y(box.bottom)],
    };
  };
  const elements = [...surface.querySelectorAll<HTMLElement>('[data-widget]')];
  const mine = elements.find((element) => Number(element.dataset.widget) === index);
  const own = mine ? edgesOf(mine) : { x: [0, 0, 0], y: [0, 0] };
  const ownX = own.x.map((edge) => edge - widget.x);
  const ownY = own.y.map((edge) => edge - widget.y);
  // Half the widget's width and height, in percent of the frame, at its size now: what
  // scales (its drawing) and what does not (its outline's padding).
  const drawn = mine?.firstElementChild ? edgesOf(mine.firstElementChild) : own;
  const halfX = (drawn.x[2]! - drawn.x[0]!) / 2;
  const halfY = (drawn.y[1]! - drawn.y[0]!) / 2;
  const alongX = { at: widget.x, half: halfX, pad: (own.x[2]! - own.x[0]!) / 2 - halfX };
  const alongY = { at: widget.y, half: halfY, pad: (own.y[1]! - own.y[0]!) / 2 - halfY };
  /** The scales the sizes can take, from 50% to 250%: across (the width) and down. */
  const limitsX: [number, number] = [WIDGET_SIZE.min / widget.size, WIDGET_SIZE.max / widget.size];
  const limitsY: [number, number] = [WIDGET_SIZE.min / height0, WIDGET_SIZE.max / height0];
  const others = elements.filter((element) => element !== mine).map(edgesOf);
  // The layout's slots: their edges and middles both ways.
  const slotList = props.guides ? slots.value : [];
  const linesX = [
    ...others.flatMap((edges) => edges.x),
    ...slotList.flatMap((slot) => [slot.x - slot.width / 2, slot.x, slot.x + slot.width / 2]),
  ];
  const linesY = [
    ...others.flatMap((edges) => edges.y),
    ...slotList.flatMap((slot) => [slot.y - slot.height / 2, slot.y + slot.height / 2]),
  ];
  /** The slots' middles down, which a widget's own middle snaps to. */
  const middlesY = slotList.map((slot) => slot.y);
  // Resizing also snaps to the frame's middle.
  const linesAcross = [50, ...linesX];
  const linesDown = [50, ...linesY];
  const reachX = (SNAP_PX / area.width) * 100;
  const reachY = (SNAP_PX / area.height) * 100;
  let moved = false;
  /** The distance from the widget's center to the finger (or between two fingers), at first. */
  let reach = 0;
  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  /** Shows the widget resized by `kx` across and `ky` down, its point at (`x`, `y`). */
  const showResized = (kx: number, ky: number, x: number, y: number) => {
    moving.value = {
      index,
      x,
      y,
      size: sizeIn(widget.size * kx),
      ...(widget.kind === 'chart' ? { height: sizeIn(height0 * ky) } : {}),
    };
  };

  /**
   * Resizes from a handle as the finger has moved (`dx` across and `dy` down, in percent of the
   * frame): from an edge, that way alone, the edge across in place; from the corner, both ways
   * by one scale, the top left corner in place. The edges that move snap to the lines.
   */
  const resizeFrom = (handle: Exclude<Hold, 'move'>, dx: number, dy: number) => {
    if (handle === 'left' || handle === 'right') {
      const dir = handle === 'right' ? 1 : -1;
      const { k, line } = scaleFromEdge(
        alongX,
        dir,
        1 + (dir * dx) / (2 * halfX),
        linesAcross,
        reachX,
        limitsX,
      );
      snap.value = { x: line, y: null };
      const kx = sizeIn(widget.size * k) / widget.size;
      showResized(kx, 1, pointAfter(alongX, dir, kx), widget.y);
    } else if (handle === 'top' || handle === 'bottom') {
      const dir = handle === 'bottom' ? 1 : -1;
      const { k, line } = scaleFromEdge(
        alongY,
        dir,
        1 + (dir * dy) / (2 * halfY),
        linesDown,
        reachY,
        limitsY,
      );
      snap.value = { x: null, y: line };
      const ky = sizeIn(height0 * k) / height0;
      showResized(1, ky, widget.x, pointAfter(alongY, dir, ky));
    } else {
      // One scale for both ways, from how far the corner moved out; the nearer snap wins.
      const k0 = 1 + (dx + dy) / (2 * (halfX + halfY));
      const limits: [number, number] = [
        Math.max(limitsX[0], limitsY[0]),
        Math.min(limitsX[1], limitsY[1]),
      ];
      const across = scaleFromEdge(alongX, 1, k0, linesAcross, reachX, limits);
      const down = scaleFromEdge(alongY, 1, k0, linesDown, reachY, limits);
      const byX = across.line !== null && across.gap <= down.gap;
      const byY = down.line !== null && !byX;
      const k = byX ? across.k : byY ? down.k : Math.min(limits[1], Math.max(limits[0], k0));
      snap.value = { x: byX ? across.line : null, y: byY ? down.line : null };
      // The scale the size rounds to, so the corner stays where it is.
      const kr = sizeIn(widget.size * k) / widget.size;
      showResized(kr, kr, pointAfter(alongX, 1, kr), pointAfter(alongY, 1, kr));
    }
  };

  /** Two fingers: resizes evenly by `k` about the widget's point, its edges snapping. */
  const resizeBy = (kx: number, ky: number, even: boolean) => {
    let [sx, sy] = [kx, ky];
    // Onto the frame's middle, or in line with another widget's edges or middle.
    const across =
      kx === 1 && !even ? null : snapScale(widget.x, alongX, kx, [50, ...linesX], reachX);
    const down =
      ky === 1 && !even ? null : snapScale(widget.y, alongY, ky, [50, ...linesY], reachY);
    if (even) {
      // One scale for both ways: the nearer snap wins.
      const gapX = across ? Math.abs(across.k - kx) * halfX : Infinity;
      const gapY = down ? Math.abs(down.k - ky) * halfY : Infinity;
      const k = gapX <= gapY ? (across?.k ?? kx) : (down?.k ?? ky);
      [sx, sy] = [k, k];
      snap.value = {
        x: across && gapX <= gapY ? across.line : null,
        y: down && gapY < gapX ? down.line : null,
      };
    } else {
      if (across) sx = across.k;
      if (down) sy = down.k;
      snap.value = { x: across?.line ?? null, y: down?.line ?? null };
    }
    moving.value = {
      index,
      x: widget.x,
      y: widget.y,
      size: sizeIn(widget.size * sx),
      ...(widget.kind === 'chart' ? { height: sizeIn(height0 * sy) } : {}),
    };
  };

  const move = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const fingers = [...pointers.values()];
    if (fingers.length === 2) {
      // Two fingers: evenly, by how far apart they are now.
      moved = true;
      const now = distance(fingers[0]!, fingers[1]!);
      reach ||= now || 1;
      resizeBy(now / reach, now / reach, true);
      return;
    }
    if (hold !== 'move') {
      // A handle: the edges held follow the finger.
      moved = true;
      resizeFrom(
        hold,
        ((e.clientX - x0) / area.width) * 100,
        ((e.clientY - y0) / area.height) * 100,
      );
      return;
    }
    if (!moved && Math.hypot(e.clientX - x0, e.clientY - y0) < 4) return;
    moved = true;
    let x = Math.min(100, Math.max(0, widget.x + ((e.clientX - x0) / area.width) * 100));
    let y = Math.min(100, Math.max(0, widget.y + ((e.clientY - y0) / area.height) * 100));
    // Onto the frame's middle first, else in line with another widget's edge or middle.
    const across = snapTo(x, [0], [50], reachX) ?? snapTo(x, ownX, linesX, reachX);
    const down = snapTo(y, [0], [50, ...middlesY], reachY) ?? snapTo(y, ownY, linesY, reachY);
    if (across) x += across.shift;
    if (down) y += down.shift;
    snap.value = { x: across?.line ?? null, y: down?.line ?? null };
    // Moving keeps the size, a chart's height apart from its width included.
    moving.value = {
      index,
      x,
      y,
      size: widget.size,
      ...(widget.kind === 'chart' ? { height: height0 } : {}),
    };
  };
  const end = (e: PointerEvent) => {
    if (!holding) return;
    pointers.delete(e.pointerId);
    if (pointers.size > 0 && e.type !== 'pointercancel') return;
    holding = false;
    pointers.clear();
    surface.removeEventListener('pointermove', move);
    surface.removeEventListener('pointerup', end);
    surface.removeEventListener('pointercancel', end);
    surface.removeEventListener('lostpointercapture', end);
    const now = moving.value;
    moving.value = null;
    snap.value = { x: null, y: null };
    if (!moved || !now) {
      if (wasPicked && widget.kind === 'text') emit('edit', index);
      return;
    }
    // A chart's height is kept apart from its width only while they differ.
    const height =
      widget.kind === 'chart' && now.height !== undefined && now.height !== now.size
        ? now.height
        : undefined;
    update(index, { x: round(now.x), y: round(now.y), size: now.size, height });
  };
  // Every move of the finger comes to the layer, and the hold ends however the browser lets
  // the finger go.
  surface.setPointerCapture(event.pointerId);
  surface.addEventListener('pointermove', move);
  surface.addEventListener('pointerup', end);
  surface.addEventListener('pointercancel', end);
  surface.addEventListener('lostpointercapture', end);
}

/** How far from a widget, in pixels, a finger still takes it: a fingertip is wide. */
const REACH = 28;

/**
 * A touch anywhere on the picture: a second finger while a widget is held resizes it;
 * otherwise it takes the widget nearest to it within a finger's reach (the picked one
 * first), and a touch far from every widget lets the picked one go.
 */
function touch(event: PointerEvent): void {
  if (holding) {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    layer.value?.setPointerCapture(event.pointerId);
    return;
  }
  // On a widget, or its corner: that one; beside them: the nearest within reach.
  const on = (event.target as HTMLElement).closest<HTMLElement>('[data-widget]');
  const near = on ? Number(on.dataset.widget) : nearestWidget(event.clientX, event.clientY);
  if (near === null) selected.value = null;
  else start(event, near, 'move');
}

/** The widget nearest to a point on the screen within a finger's reach; null if none is. */
function nearestWidget(x: number, y: number): number | null {
  const elements = layer.value?.querySelectorAll<HTMLElement>('[data-widget]') ?? [];
  let best: { index: number; gap: number } | null = null;
  for (const element of elements) {
    const index = Number(element.dataset.widget);
    const box = element.getBoundingClientRect();
    // How far the point is outside the widget's box; 0 inside it.
    const gap = Math.hypot(
      Math.max(box.left - x, 0, x - box.right),
      Math.max(box.top - y, 0, y - box.bottom),
    );
    // The picked widget wins a near tie, so it can be taken again among close neighbors.
    const weighted = gap - (index === selected.value ? 6 : 0);
    if (gap <= REACH && (!best || weighted < best.gap)) best = { index, gap: weighted };
  }
  return best?.index ?? null;
}

/** Arrow keys move the picked widget by 1% of the frame (Shift: 5%), + and - resize it. */
function key(event: KeyboardEvent, index: number): void {
  const widget = props.widgets[index]!;
  const step = event.shiftKey ? 5 : 1;
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  const by = moves[event.key];
  if (by) {
    event.preventDefault();
    const x = Math.min(100, Math.max(0, widget.x + by[0]));
    const y = Math.min(100, Math.max(0, widget.y + by[1]));
    update(index, { x, y });
  } else if (event.key === '+' || event.key === '-') {
    event.preventDefault();
    // A chart taller or shorter than wide keeps its shape, scaled the same way.
    const size = sizeIn(widget.size + (event.key === '+' ? 10 : -10));
    const height =
      widget.kind === 'chart' && widget.height !== undefined
        ? sizeIn((widget.height * size) / widget.size)
        : undefined;
    update(index, { size, height });
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    remove(index);
  }
}

/**
 * Arranges the widgets in the layout's slots (see the engine's layouts.ts), measured as they
 * show on the picture, and gives them as a change.
 */
function arrange(): void {
  const surface = layer.value;
  if (!surface) return;
  const area = surface.getBoundingClientRect();
  const measured = new Map<number, { width: number; height: number }>();
  for (const element of surface.querySelectorAll<HTMLElement>('[data-widget]')) {
    const box = element.getBoundingClientRect();
    measured.set(Number(element.dataset.widget), {
      width: box.width / area.width,
      height: box.height / area.height,
    });
  }
  // Each widget at its normal size: what shows now, scaled back from its size (a chart's
  // height from its own).
  const atNormal = props.widgets.map((widget, k) => {
    const box = measured.get(k) ?? { width: 0, height: 0 };
    const height = widget.kind === 'chart' ? (widget.height ?? widget.size) : widget.size;
    return { width: (box.width * 100) / widget.size, height: (box.height * 100) / height };
  });
  emit(
    'change',
    arrangeInLayout(props.widgets, slots.value, (_, k) => atNormal[k]!),
  );
}
defineExpose({ arrange });

/** Story-shaped frames (taller than 4:5) get the platforms' guides. */
const story = computed(() => props.size.width / props.size.height < 0.8);
</script>

<template>
  <!-- The browser's own long-press menu would take a held widget away. -->
  <div
    ref="layer"
    class="layer"
    :class="{ card }"
    :style="{ '--unit': unit }"
    @pointerdown="touch"
    @contextmenu.prevent
  >
    <!-- While a widget moves: what Instagram's own controls cover on a Reel or Story, as
         Meta's ads guide gives it: 14% at the top, 35% at the bottom, 6% at each side. -->
    <div v-if="story && moving" class="guides" aria-hidden="true">
      <span class="zone top" />
      <span class="zone bottom"><span class="covered">Covered on Instagram</span></span>
      <span class="zone left" />
      <span class="zone right" />
    </div>
    <!-- The layout's slots, faint, with what each is for. -->
    <span
      v-for="(slot, k) in guides ? slots : []"
      :key="`slot-${k}`"
      class="slot"
      :class="slot.kind"
      :style="{
        left: `${slot.x - slot.width / 2}%`,
        top: `${slot.y - slot.height / 2}%`,
        width: `${slot.width}%`,
        height: `${slot.height}%`,
      }"
      aria-hidden="true"
    >
      <span class="slot-name">{{
        slot.kind === 'title' ? 'Title' : slot.kind === 'chart' ? 'Chart' : 'Stat'
      }}</span>
    </span>
    <span
      v-if="snap.x !== null"
      class="line across"
      :style="{ left: `${snap.x}%` }"
      aria-hidden="true"
    />
    <span
      v-if="snap.y !== null"
      class="line down"
      :style="{ top: `${snap.y}%` }"
      aria-hidden="true"
    />

    <div
      v-for="(widget, index) in shown"
      :key="index"
      class="widget"
      :class="{
        selected: selected === index,
        moving: moving?.index === index,
      }"
      :style="{
        left: `${widget.x}%`,
        top: `${widget.y}%`,
        '--size': widget.size / 100,
        '--height': (widget.kind === 'chart' ? (widget.height ?? widget.size) : widget.size) / 100,
      }"
      role="button"
      tabindex="0"
      :aria-label="`${widgetLabel(widget, values)} on the picture: drag to move it; arrow keys move it, plus and minus resize it, Delete removes it`"
      :aria-pressed="selected === index"
      :data-testid="`widget-${index}`"
      :data-widget="index"
      @focus="selected = index"
      @keydown="key($event, index)"
    >
      <!-- What the engine draws for it, at its size. -->
      <span v-if="widget.kind === 'text'" class="text">{{ textOf(widget)!.line }}</span>
      <span
        v-else-if="widget.kind === 'metric'"
        class="metric"
        :class="{ dates: widget.metric === 'date' }"
      >
        <span v-if="besideOf(widget)" class="value">
          <StatIcon v-if="widget.icon" :icon="iconOf(widget.metric)" />
          <span v-if="besideOf(widget)!.before" class="words beside before">{{
            besideOf(widget)!.before
          }}</span>
          {{ besideOf(widget)!.number }}
          <span v-if="besideOf(widget)!.after" class="words beside after">{{
            besideOf(widget)!.after
          }}</span>
        </span>
        <template v-else>
          <span v-if="textOf(widget)!.above" class="words above">{{ textOf(widget)!.above }}</span>
          <span class="value"
            ><StatIcon v-if="widget.icon" :icon="iconOf(widget.metric)" />{{
              textOf(widget)!.line
            }}</span
          >
          <span v-if="textOf(widget)!.under" class="words">{{ textOf(widget)!.under }}</span>
        </template>
      </span>
      <span
        v-else-if="widget.kind === 'chart'"
        class="chart-box"
        :style="{ color: `rgb(${colorsOf(widget).line})` }"
      >
        <StatIcon v-if="widget.icon" class="chart-icon" :icon="chartIcon(widget.chart)" />
        <svg class="chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient :id="`chart-fill-${index}`" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" :stop-color="`rgba(${colorsOf(widget).fill}, 0.55)`" />
              <stop offset="1" :stop-color="`rgba(${colorsOf(widget).fill}, 0.12)`" />
            </linearGradient>
          </defs>
          <path :d="chartPath(widget.chart)" :fill="`url(#chart-fill-${index})`" />
          <path
            :d="chartPath(widget.chart)"
            fill="none"
            :stroke="`rgb(${colorsOf(widget).line})`"
            stroke-width="1.5"
            vector-effect="non-scaling-stroke"
          />
        </svg>
      </span>

      <span class="name" aria-hidden="true">{{ widgetLabel(widget, values) }}</span>
      <template v-if="selected === index && !moving">
        <span
          class="handle"
          :data-testid="`resize-${index}`"
          aria-hidden="true"
          @pointerdown="start($event, index, 'corner')"
        />
        <!-- A chart's width from its left or right edge, its height from its top or bottom
             edge, the edge across in place. -->
        <template v-if="widget.kind === 'chart'">
          <span
            v-for="edge in ['left', 'right', 'top', 'bottom'] as const"
            :key="edge"
            class="handle edge"
            :class="edge"
            :data-testid="`resize-${edge}-${index}`"
            aria-hidden="true"
            @pointerdown="start($event, index, edge)"
          />
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* Over the still; its width is the unit the widgets are sized in. */
.layer {
  position: absolute;
  inset: 0;
  container-type: size;
  touch-action: none;
  user-select: none;
  -webkit-touch-callout: none;
}

/* A widget centered on its point, with a faint outline until it is picked. */
.widget {
  position: absolute;
  padding: 2px 4px;
  border: 1px dashed rgba(255, 255, 255, 0.35);
  border-radius: 4px;
  cursor: grab;
  touch-action: none;
  transform: translate(-50%, -50%);
  white-space: nowrap;
}

.widget.selected,
.widget.moving {
  z-index: 1;
}

.widget.selected,
.widget.moving,
.widget:focus-visible {
  border: 1px solid var(--accent);
  outline: none;
}

.widget.moving {
  cursor: grabbing;
}

/* The engine's sizes, for a frame 1080 pixels on its shorter side (see `unit`), with the
   soft shadow it draws around letters. */
.text,
.metric {
  display: block;
  color: rgba(255, 255, 255, 0.92);
  font-weight: 600;
  letter-spacing: normal;
  text-align: center;
  text-shadow: 0 calc(var(--unit) * 2 * var(--size) * 1cqw)
    calc(var(--unit) * 10 * var(--size) * 1cqw) rgba(0, 0, 0, 0.75);
}

.text {
  font-size: calc(var(--unit) * 44 * var(--size) * 1cqw);
  line-height: 1.27;
}

.metric .value {
  display: block;
  /* Its digits all as wide, as the video draws them. */
  font-variant-numeric: tabular-nums;
  font-size: calc(var(--unit) * 52 * var(--size) * 1cqw);
  line-height: 1.1;
}

.metric .words {
  display: block;
  color: rgba(255, 255, 255, 0.66);
  font-size: calc(var(--unit) * 24 * var(--size) * 1cqw);
  font-weight: 400;
  line-height: 1.3;
}

/* A chart, after its icon when it shows one: as the engine sets it, half the chart's height
   and 0.45 of that after it. */
.chart-box {
  display: flex;
  align-items: center;
  width: min(100cqw, calc(86cqw * var(--size)));
  height: calc(var(--unit) * 80 * var(--height) * 1cqw);
}

.chart {
  display: block;
  flex: 1;
  min-width: 0;
  height: 100%;
}

.chart-box .chart-icon {
  flex: none;
  width: calc(var(--unit) * 40 * var(--height) * 1cqw);
  height: calc(var(--unit) * 40 * var(--height) * 1cqw);
  margin: 0 calc(var(--unit) * 18 * var(--height) * 1cqw) 0 0;
}

/* On the totals card, its sizes (a value's number smaller for the dates), with no shadow: a
   text over a short orange rule, a value's number over its words in orange. The lines are
   set so each sits where the card draws it, from the top of the widget's box. */
.card .text,
.card .metric {
  text-shadow: none;
}

.card .text {
  color: rgba(255, 255, 255, 0.94);
  font-size: calc(var(--unit) * 52 * var(--size) * 1cqw);
}

.card .text::after {
  content: '';
  display: block;
  width: calc(var(--unit) * 64 * var(--size) * 1cqw);
  height: calc(var(--unit) * 5 * var(--size) * 1cqw);
  margin: calc(var(--unit) * 20 * var(--size) * 1cqw) auto 0;
  background: #ff8a2a;
}

.card .metric {
  --number: 96;
}

.card .metric.dates {
  --number: 60;
}

.card .metric .value {
  color: rgba(255, 255, 255, 0.96);
  font-size: calc(var(--unit) * var(--number) * var(--size) * 1cqw);
  font-weight: 700;
  line-height: 1.27;
}

.card .metric .words {
  margin-top: calc(var(--unit) * (22 - 0.27 * var(--number)) * var(--size) * 1cqw);
  color: rgba(255, 176, 102, 0.9);
  font-size: calc(var(--unit) * 30 * var(--size) * 1cqw);
  font-weight: 500;
  line-height: 1.27;
}

/* On the card, words above the number end the gap above it; words beside it sit on its line,
   at their own size, as the card draws them. */
.card .metric .words.above {
  margin-top: 0;
  margin-bottom: calc(var(--unit) * 22 * var(--size) * 1cqw);
}

.card .metric .words.beside {
  display: inline;
  margin: 0;
}

/* The widget's name on a tab above its outline, when picked. */
.name {
  position: absolute;
  bottom: 100%;
  left: -1px;
  padding: 0 0.3rem;
  border-radius: 3px 3px 0 0;
  color: #1a110b;
  background: var(--accent);
  font-size: 0.6rem;
  font-weight: 700;
  line-height: 1.4;
  opacity: 0;
  pointer-events: none;
}

.widget.selected .name,
.widget.moving .name {
  opacity: 1;
}

/* The resize handle on the bottom right, larger to touch than it looks. */
.handle::after {
  content: '';
  position: absolute;
  inset: -4px;
}

.handle {
  position: absolute;
  right: -7px;
  bottom: -7px;
  width: 10px;
  height: 10px;
  border: 2px solid var(--accent);
  border-radius: 2px;
  background: #fff;
  cursor: nwse-resize;
}

/* A chart's edge handles: in the middle of each edge. */
.handle.edge.left,
.handle.edge.right {
  top: calc(50% - 6px);
  bottom: auto;
  cursor: ew-resize;
}

.handle.edge.left {
  right: auto;
  left: -7px;
}

.handle.edge.top,
.handle.edge.bottom {
  right: calc(50% - 6px);
  cursor: ns-resize;
}

.handle.edge.top {
  top: -7px;
  bottom: auto;
}

/* A layout's slot: a faint dashed box, its name small in its corner. */
.slot {
  position: absolute;
  box-sizing: border-box;
  border: 1px dashed rgb(120 200 255 / 55%);
  border-radius: 4px;
  background: rgb(120 200 255 / 6%);
  pointer-events: none;
}

.slot-name {
  position: absolute;
  top: 1px;
  left: 3px;
  color: rgb(150 215 255 / 80%);
  font-size: 0.5rem;
  line-height: 1;
}

/* A center line the widget snapped to. */
.line {
  position: absolute;
  background: var(--accent);
  pointer-events: none;
}

.line.across {
  top: 0;
  bottom: 0;
  width: 1px;
}

.line.down {
  right: 0;
  left: 0;
  height: 1px;
}

.guides {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.zone {
  position: absolute;
  background: repeating-linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.07) 0 6px,
    transparent 6px 12px
  );
}

/* The label at the top of the covered part at the bottom. */
.covered {
  position: absolute;
  top: 0.3rem;
  left: 50%;
  padding: 0.05rem 0.4rem;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(0, 0, 0, 0.55);
  font-size: 0.6rem;
  white-space: nowrap;
  transform: translateX(-50%);
}

.zone.top {
  inset: 0 0 auto;
  height: 14%;
}

.zone.bottom {
  inset: auto 0 0;
  height: 35%;
}

.zone.left {
  inset: 14% auto 35% 0;
  width: 6%;
}

.zone.right {
  inset: 14% 0 35% auto;
  width: 6%;
}
</style>
