<script setup lang="ts">
// Arranging the widgets over the still of the video's last frame, as stickers are arranged in
// a story editor. The still is drawn without them; the page draws them over it, at the sizes
// the engine draws them in the video (text, a value with its words, the elevation chart), so
// they move under the finger at once and nothing is drawn again while they are arranged.
//
// A tap picks a widget, the one nearest the finger within its reach, so a fingertip need not
// land on a small widget exactly: an outline, × to remove it and a corner handle. Dragging moves it,
// centered on where it is let go; it snaps to the frame's center lines, with a line shown,
// and while it is dragged a bin shows at the bottom, where letting go removes it. Two
// fingers, or the corner handle, resize it. A tap on a picked text widget asks for its text
// (`edit`). The keyboard moves a picked widget with the arrow keys, resizes it with + and -,
// and removes it with Delete. On a story-shaped frame, while a widget moves, guides show the
// parts the platforms' own controls cover.
import { WIDGET_SIZE, type Metric, type MetricValue, type Widget } from '@wornways/engine';
import { computed, ref } from 'vue';
import { widgetLabel } from '../adjust.ts';

const props = defineProps<{
  widgets: Widget[];
  /** Each value as it stands at the end, which the still shows. */
  values: Map<Metric, MetricValue>;
  /** The video's title, which a text widget without its own text shows. */
  title: string;
  /** The climb profile's shape, heights from 0 to 1, for the elevation chart. */
  profile: number[] | null;
  /** The video's frame, in pixels: the widgets are sized as the engine sizes them in it. */
  size: { width: number; height: number };
}>();
/** The picked widget's index; null when none is. */
const selected = defineModel<number | null>('selected', { required: true });
const emit = defineEmits<{
  /** The widgets after a change: moved, resized or removed. */
  change: [widgets: Widget[]];
  /** A picked text widget was tapped: its text is asked for. */
  edit: [index: number];
}>();

/** The widget being moved or resized, where it is now: its point and size. */
const moving = ref<{ index: number; x: number; y: number; size: number } | null>(null);
const snap = ref({ x: false, y: false });
/** Whether the widget being dragged is over the bin. */
const overBin = ref(false);

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

/** The text a widget shows, or nothing for the chart. */
function textOf(widget: Widget): { value: string; label: string } | null {
  if (widget.kind === 'text') return { value: widget.text ?? props.title, label: '' };
  if (widget.kind === 'metric')
    return props.values.get(widget.metric) ?? { value: '…', label: widgetLabel(widget) };
  return null;
}

/** The chart's outline over its box, 100 wide and 100 high, as the engine draws it. */
const chartPath = computed(() => {
  const shape = props.profile;
  if (!shape || shape.length < 2) return '';
  const points = shape.map(
    (v, k) => `${((k / (shape.length - 1)) * 100).toFixed(2)},${(100 - (14 + 86 * v)).toFixed(2)}`,
  );
  return `M0,100 L${points.join(' L')} L100,100 Z`;
});

/** How near the middle, in percent of the frame, a widget's center snaps to it. */
const SNAP = 2.5;
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

/** Starts dragging a widget, or with `resize` its corner handle. */
function start(event: PointerEvent, index: number, resize: boolean): void {
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
  const wasPicked = selected.value === index;
  selected.value = index;
  const area = surface.getBoundingClientRect();
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const [x0, y0] = [event.clientX, event.clientY];
  const centerPx = {
    x: area.left + (widget.x / 100) * area.width,
    y: area.top + (widget.y / 100) * area.height,
  };
  let moved = false;
  /** The distance between two fingers, or from the widget's center to the finger, at first. */
  let reach = 0;
  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const move = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const fingers = [...pointers.values()];
    if (fingers.length === 2 || resize) {
      const [a, b] = fingers.length === 2 ? fingers : [fingers[0]!, centerPx];
      const now = distance(a!, b!);
      reach ||= now;
      moved = true;
      overBin.value = false;
      moving.value = {
        index,
        x: widget.x,
        y: widget.y,
        size: sizeIn((widget.size * now) / reach),
      };
      return;
    }
    if (!moved && Math.hypot(e.clientX - x0, e.clientY - y0) < 4) return;
    moved = true;
    let x = Math.min(100, Math.max(0, widget.x + ((e.clientX - x0) / area.width) * 100));
    let y = Math.min(100, Math.max(0, widget.y + ((e.clientY - y0) / area.height) * 100));
    snap.value = { x: Math.abs(x - 50) < SNAP, y: Math.abs(y - 50) < SNAP };
    if (snap.value.x) x = 50;
    if (snap.value.y) y = 50;
    overBin.value =
      Math.abs(e.clientX - (area.left + area.width / 2)) < 32 && area.bottom - e.clientY < 64;
    moving.value = { index, x, y, size: widget.size };
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
    const bin = overBin.value;
    moving.value = null;
    overBin.value = false;
    snap.value = { x: false, y: false };
    if (bin) return remove(index);
    if (!moved || !now) {
      if (wasPicked && widget.kind === 'text') emit('edit', index);
      return;
    }
    update(index, { x: round(now.x), y: round(now.y), size: now.size });
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
  const near = nearestWidget(event.clientX, event.clientY);
  if (near === null) selected.value = null;
  else start(event, near, false);
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
    update(index, { size: sizeIn(widget.size + (event.key === '+' ? 10 : -10)) });
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    remove(index);
  }
}

/** Story-shaped frames (taller than 4:5) get the platforms' guides. */
const story = computed(() => props.size.width / props.size.height < 0.8);
</script>

<template>
  <!-- The browser's own long-press menu would take a held widget away. -->
  <div
    ref="layer"
    class="layer"
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
    <span v-if="snap.x" class="line across" aria-hidden="true" />
    <span v-if="snap.y" class="line down" aria-hidden="true" />
    <span
      v-if="moving && moving.size === widgets[moving.index]?.size"
      class="bin"
      :class="{ over: overBin }"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
    </span>

    <div
      v-for="(widget, index) in shown"
      :key="index"
      class="widget"
      :class="{
        selected: selected === index,
        moving: moving?.index === index,
        gone: moving?.index === index && overBin,
      }"
      :style="{ left: `${widget.x}%`, top: `${widget.y}%`, '--size': widget.size / 100 }"
      role="button"
      tabindex="0"
      :aria-label="`${widgetLabel(widget)} on the picture: drag to move it; arrow keys move it, plus and minus resize it, Delete removes it`"
      :aria-pressed="selected === index"
      :data-testid="`widget-${index}`"
      :data-widget="index"
      @focus="selected = index"
      @keydown="key($event, index)"
    >
      <!-- What the engine draws for it, at its size. -->
      <span v-if="widget.kind === 'text'" class="text">{{ textOf(widget)!.value }}</span>
      <span v-else-if="widget.kind === 'metric'" class="metric">
        <span class="value">{{ textOf(widget)!.value }}</span>
        <span v-if="textOf(widget)!.label" class="words">{{ textOf(widget)!.label }}</span>
      </span>
      <svg v-else class="chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="rgb(255 138 42 / 55%)" />
            <stop offset="1" stop-color="rgb(255 138 42 / 12%)" />
          </linearGradient>
        </defs>
        <path :d="chartPath" fill="url(#chart-fill)" />
        <path
          :d="chartPath"
          fill="none"
          stroke="#ff8a2a"
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
        />
      </svg>

      <span class="name" aria-hidden="true">{{ widgetLabel(widget) }}</span>
      <template v-if="selected === index && !moving">
        <button
          type="button"
          class="remove"
          :aria-label="`Remove ${widgetLabel(widget).toLowerCase()}`"
          @pointerdown.stop
          @click.stop="remove(index)"
        >
          ×
        </button>
        <span
          class="handle"
          :data-testid="`resize-${index}`"
          aria-hidden="true"
          @pointerdown="start($event, index, true)"
        />
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

.widget.gone {
  opacity: 0.4;
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

.chart {
  display: block;
  width: min(100cqw, calc(86cqw * var(--size)));
  height: calc(var(--unit) * 80 * var(--size) * 1cqw);
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

/* × on the top right corner, the resize handle on the bottom right, larger than they look. */
.remove {
  position: absolute;
  top: -11px;
  right: -11px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: #111;
  background: #fff;
  font-size: 0.85rem;
  font-weight: 800;
  line-height: 1;
}

.remove::after,
.handle::after {
  content: '';
  position: absolute;
  inset: -10px;
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

/* The bin at the bottom middle while a widget is dragged; red when it would take it. */
.bin {
  position: absolute;
  bottom: 4%;
  left: 50%;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 1.5px solid rgba(255, 255, 255, 0.6);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  transform: translateX(-50%);
  pointer-events: none;
}

.bin svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: #fff;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.bin.over {
  border-color: #d9443a;
  background: #d9443a;
  transform: translateX(-50%) scale(1.15);
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
  left: 50%;
  width: 1px;
}

.line.down {
  top: 50%;
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
