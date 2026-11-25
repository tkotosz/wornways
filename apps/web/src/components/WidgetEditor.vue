<script setup lang="ts">
// Arranging the widgets on the still of the video's last frame, as stickers are arranged in a
// story editor. Each widget has an outline over where the engine drew it (the boxes it
// reports with the still). A tap picks one: its outline, × to remove it and a corner handle.
// Dragging moves it, centered on where it is let go: a copy of it, cut from the still,
// follows the finger, and stays where it was let go until the picture drawn for it arrives; it snaps to the frame's center lines,
// with a line shown, and while it is dragged a bin shows at the bottom, where letting go
// removes it. Two fingers, or the corner handle, resize it. A tap on a picked text widget
// asks for its text (`edit`). The picture is redrawn as soon as a widget is let go
// (`placed`); its outline stays where it was let go until the new picture arrives. The
// keyboard moves a picked widget with the arrow keys, resizes it with + and -, and removes
// it with Delete. On a story-shaped frame, while a widget is picked or moved, guides show
// the parts the platforms' own controls cover.
import { WIDGET_SIZE, type FrameBox, type Widget } from '@wornways/engine';
import { computed, ref, watch } from 'vue';
import { widgetLabel } from '../adjust.ts';

const props = defineProps<{
  widgets: Widget[];
  /** Where the still drew each widget, in the same order; null for one not drawn. */
  boxes: (FrameBox | null)[];
  /** The still's picture, cut from for a widget being moved (see `ghost`). */
  still: string;
  /** The frame's width over its height. */
  ratio: number;
}>();
/** The picked widget's index; null when none is. */
const selected = defineModel<number | null>('selected', { required: true });
const emit = defineEmits<{
  /** The widgets after a change: moved, resized or removed. */
  change: [widgets: Widget[]];
  /** A widget was let go: the next change should be drawn at once. */
  placed: [];
  /** A picked text widget was tapped: its text is asked for. */
  edit: [index: number];
}>();

/**
 * Outlines show where the still drew each widget; after a widget is added or removed they
 * wait for the new picture, as the old one no longer matches the list.
 */
const stale = ref(false);
/** The widget being moved or resized, with its box as it follows the pointer. */
const moving = ref<{ index: number; box: FrameBox; snapX: boolean; snapY: boolean } | null>(null);
/** Whether the widget being dragged is over the bin. */
const overBin = ref(false);
watch(
  () => props.boxes,
  () => {
    moving.value = null;
    stale.value = false;
  },
);

/** The outline of each widget: as it follows the pointer, else where it was drawn. */
const outlines = computed(() =>
  props.widgets.flatMap((widget, index) => {
    const box = moving.value?.index === index ? moving.value.box : props.boxes[index];
    return box && !stale.value ? [{ widget, index, box }] : [];
  }),
);

/** How near to the middle, in fractions of the frame, a widget's center snaps to it. */
const SNAP = 0.025;
const layer = ref<HTMLElement | null>(null);

/** The widgets with one changed; `placed` first when it was let go after dragging. */
function update(index: number, changed: Partial<Widget>, letGo = true): void {
  if (letGo) emit('placed');
  emit(
    'change',
    props.widgets.map((widget, k) =>
      k === index ? ({ ...widget, ...changed } as Widget) : widget,
    ),
  );
}

function remove(index: number): void {
  stale.value = true;
  selected.value = null;
  emit(
    'change',
    props.widgets.filter((_, k) => k !== index),
  );
}

const round = (n: number) => Math.round(n * 10) / 10;
const sizeIn = (size: number) =>
  Math.round(Math.min(WIDGET_SIZE.max, Math.max(WIDGET_SIZE.min, size)));

/** The pointers down on the layer, for two-finger resizing. */
const pointers = new Map<number, { x: number; y: number }>();

/** Starts dragging a widget, or with `resize` its corner handle. */
function start(event: PointerEvent, index: number, resize: boolean): void {
  if (event.button !== 0 || !layer.value) return;
  event.preventDefault();
  event.stopPropagation();
  // A second finger while one is down: the drag under way turns into resizing.
  if (pointers.size > 0) {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    return;
  }
  const area = layer.value.getBoundingClientRect();
  const box = props.boxes[index];
  if (!box) return;
  const widget = props.widgets[index]!;
  const wasPicked = selected.value === index;
  selected.value = index;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const [x0, y0] = [event.clientX, event.clientY];
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  let moved = false;
  /** The distance between two fingers, or from the box's center to the pointer. */
  let reach = 0;

  const scaled = (scale: number): FrameBox => ({
    x: center.x - (box.width * scale) / 2,
    y: center.y - (box.height * scale) / 2,
    width: box.width * scale,
    height: box.height * scale,
  });
  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const centerPx = { x: area.left + center.x * area.width, y: area.top + center.y * area.height };

  const move = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const fingers = [...pointers.values()];
    if (fingers.length === 2 || resize) {
      const [a, b] = fingers.length === 2 ? fingers : [fingers[0]!, centerPx];
      const now = distance(a!, b!);
      reach ||= now;
      moved = true;
      const scale = sizeIn((widget.size * now) / reach) / widget.size;
      moving.value = { index, box: scaled(scale), snapX: false, snapY: false };
      return;
    }
    const dx = (e.clientX - x0) / area.width;
    const dy = (e.clientY - y0) / area.height;
    if (!moved && Math.hypot(e.clientX - x0, e.clientY - y0) < 4) return;
    moved = true;
    let cx = Math.min(1, Math.max(0, center.x + dx));
    let cy = Math.min(1, Math.max(0, center.y + dy));
    const snapX = Math.abs(cx - 0.5) < SNAP;
    const snapY = Math.abs(cy - 0.5) < SNAP;
    if (snapX) cx = 0.5;
    if (snapY) cy = 0.5;
    overBin.value =
      Math.abs(e.clientX - (area.left + area.width / 2)) < 32 && area.bottom - e.clientY < 64;
    moving.value = {
      index,
      box: { ...box, x: cx - box.width / 2, y: cy - box.height / 2 },
      snapX,
      snapY,
    };
  };
  const end = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size > 0) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    const bin = overBin.value;
    overBin.value = false;
    if (bin) return remove(index);
    const now = moving.value;
    if (!moved || !now) {
      moving.value = null;
      if (wasPicked && widget.kind === 'text') emit('edit', index);
      return;
    }
    const scale = now.box.width / box.width;
    if (Math.abs(scale - 1) > 0.001) update(index, { size: sizeIn(widget.size * scale) });
    else
      update(index, {
        x: round((now.box.x + now.box.width / 2) * 100),
        y: round((now.box.y + now.box.height / 2) * 100),
      });
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

/** A second finger on the picture while a widget is held resizes it. */
function secondFinger(event: PointerEvent): void {
  if (pointers.size === 1) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  else selected.value = null;
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
    update(index, { x, y }, false);
  } else if (event.key === '+' || event.key === '-') {
    event.preventDefault();
    update(index, { size: sizeIn(widget.size + (event.key === '+' ? 10 : -10)) }, false);
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    remove(index);
  }
}

/**
 * The still placed in a widget's moving box so that the part it drew the widget in fills
 * it: the copy that follows the finger, at the widget's new size while it is resized.
 */
function ghost(index: number) {
  const drawn = props.boxes[index]!;
  return {
    width: `${100 / drawn.width}%`,
    height: `${100 / drawn.height}%`,
    left: `${(-drawn.x / drawn.width) * 100}%`,
    top: `${(-drawn.y / drawn.height) * 100}%`,
  };
}

/** A box as CSS for its outline, in percent of the frame. */
const place = (box: FrameBox) => ({
  left: `${box.x * 100}%`,
  top: `${box.y * 100}%`,
  width: `${box.width * 100}%`,
  height: `${box.height * 100}%`,
});

/** Story-shaped frames (taller than 4:5) get the platforms' guides. */
const story = computed(() => props.ratio < 0.8);
</script>

<template>
  <!-- Pressing the picture outside the widgets lets the picked one go. -->
  <div ref="layer" class="layer" @pointerdown.self="secondFinger">
    <!-- What Instagram's own controls cover on a Reel or Story, as Meta's ads guide gives it:
         14% at the top, 35% at the bottom, 6% at each side. -->
    <div v-if="story && (selected !== null || moving)" class="guides" aria-hidden="true">
      <span class="zone top" />
      <span class="zone bottom" />
      <span class="zone left" />
      <span class="zone right" />
    </div>
    <span v-if="moving?.snapX" class="line across" aria-hidden="true" />
    <span v-if="moving?.snapY" class="line down" aria-hidden="true" />
    <span
      v-if="moving && moving.box.width === boxes[moving.index]?.width"
      class="bin"
      :class="{ over: overBin }"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
    </span>
    <div
      v-for="o in outlines"
      :key="o.index"
      class="widget"
      :class="{ selected: selected === o.index, moving: moving?.index === o.index, gone: overBin }"
      :style="place(o.box)"
      role="button"
      tabindex="0"
      :aria-label="`${widgetLabel(o.widget)} on the picture: drag to move it; arrow keys move it, plus and minus resize it, Delete removes it`"
      :aria-pressed="selected === o.index"
      :data-testid="`widget-${o.index}`"
      @pointerdown="start($event, o.index, false)"
      @focus="selected = o.index"
      @keydown="key($event, o.index)"
    >
      <span
        v-if="moving?.index === o.index && still && boxes[o.index]"
        class="ghost"
        aria-hidden="true"
      >
        <img :src="still" alt="" :style="ghost(o.index)" />
      </span>
      <span class="name" aria-hidden="true">{{ widgetLabel(o.widget) }}</span>
      <template v-if="selected === o.index && !moving">
        <button
          type="button"
          class="remove"
          :aria-label="`Remove ${widgetLabel(o.widget).toLowerCase()}`"
          @pointerdown.stop
          @click.stop="remove(o.index)"
        >
          ×
        </button>
        <span
          class="handle"
          :data-testid="`resize-${o.index}`"
          aria-hidden="true"
          @pointerdown="start($event, o.index, true)"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.layer {
  position: absolute;
  inset: 0;
  touch-action: none;
}

/* An outline around each widget, faint until it is picked. */
.widget {
  position: absolute;
  box-sizing: content-box;
  margin: -4px;
  padding: 3px;
  border: 1px dashed rgba(255, 255, 255, 0.35);
  border-radius: 4px;
  cursor: grab;
  touch-action: none;
}

/* A larger place to touch than the widget itself, for fingers. */
.widget::before {
  content: '';
  position: absolute;
  inset: -8px;
}

/* The copy of the widget that follows the finger, cut from the still. */
.ghost {
  position: absolute;
  inset: 3px;
  overflow: hidden;
  pointer-events: none;
}

.ghost img {
  position: absolute;
  max-width: none;
}

.widget.selected,
.widget.moving,
.widget:focus-visible {
  border: 1px solid var(--accent);
  outline: none;
  background: rgba(255, 138, 42, 0.08);
}

.widget.moving {
  cursor: grabbing;
}

.widget.moving.gone {
  opacity: 0.4;
}

/* The widget's name on a tab above its outline. */
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
  white-space: nowrap;
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
