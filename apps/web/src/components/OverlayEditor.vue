<script setup lang="ts">
// Arranging the title and the metrics card on the still of the video's last frame. Each
// sits in an outline over where the engine drew it (the boxes it reports with the still).
// Dragging an outline moves the block; the handle on its corner resizes it. A block lets go
// at a point of the frame, lined up with it by the third the point falls in, as the engine
// places it; near one of the nine named positions both ways it snaps to it, and near the
// middle of the frame to its center lines. While a block is dragged its outline follows the
// pointer; the picture is redrawn when it is let go (`placed`). The keyboard moves a selected
// block with the arrow keys and resizes it with + and -. On a story-shaped frame, while a
// block is selected, guides show the parts the platforms' own controls cover.
import {
  POSITIONS,
  framePointText,
  type FrameBox,
  type OverlayBoxes,
  type Position,
} from '@wornways/engine';
import { computed, ref, watch } from 'vue';
import type { Adjustments } from '../adjust.ts';

type Block = 'title' | 'metrics';

const props = defineProps<{
  boxes: OverlayBoxes;
  /** The frame's width over its height. */
  ratio: number;
}>();
const adjustments = defineModel<Adjustments>({ required: true });
const emit = defineEmits<{
  /** A block was let go: the next change should be drawn at once. */
  placed: [];
  /** A block was picked, to show its settings. */
  select: [block: Block];
}>();

const BLOCKS: { id: Block; label: string; position: string; size: string }[] = [
  { id: 'title', label: 'Title', position: 'title-position', size: 'title-size' },
  { id: 'metrics', label: 'Metrics', position: 'metrics-position', size: 'metrics-size' },
];

/** The blocks this still has, with where they were drawn. */
const shown = computed(() =>
  BLOCKS.flatMap((b) => (props.boxes[b.id] ? [{ ...b, box: props.boxes[b.id]! }] : [])),
);

const selected = ref<Block | null>(null);

/**
 * The block being dragged or resized: its box as it follows the pointer, and the lines it
 * snapped to. It stays after it is let go, until the picture redrawn for it arrives.
 */
const moving = ref<{
  block: Block;
  box: FrameBox;
  snapX: number | null;
  snapY: number | null;
  named: Position | null;
} | null>(null);
watch(
  () => props.boxes,
  () => (moving.value = null),
);

/** The frame's sides, the margin named positions keep from them (as the engine's 7%). */
const MARGIN = 0.07;
/** How near, in fractions of the frame, a block's edge or middle snaps to a line. */
const SNAP = 0.025;

/**
 * Where a box of the frame sits as a placement: the point it lines up with by the third
 * its middle falls in (its left edge, middle or right edge; its top, middle or bottom).
 */
function anchorOf(box: FrameBox): { x: number; y: number } {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const x = cx < 1 / 3 ? box.x : cx > 2 / 3 ? box.x + box.width : cx;
  const y = cy < 1 / 3 ? box.y : cy > 2 / 3 ? box.y + box.height : cy;
  return { x: x * 100, y: y * 100 };
}

/**
 * Snaps a box to the lines near it: across, the left margin, the middle or the right
 * margin; down, the top margin, the middle or the bottom margin. Snapped both ways, it
 * stands for the named position there.
 */
function snap(box: FrameBox) {
  const out = { ...box };
  let snapX: number | null = null;
  let snapY: number | null = null;
  let side: 'left' | 'center' | 'right' | null = null;
  let row: 'top' | 'middle' | 'bottom' | null = null;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (Math.abs(box.x - MARGIN) < SNAP) [out.x, snapX, side] = [MARGIN, MARGIN, 'left'];
  else if (Math.abs(cx - 0.5) < SNAP) [out.x, snapX, side] = [0.5 - box.width / 2, 0.5, 'center'];
  else if (Math.abs(box.x + box.width - (1 - MARGIN)) < SNAP)
    [out.x, snapX, side] = [1 - MARGIN - box.width, 1 - MARGIN, 'right'];
  // About where the engine puts blocks in the top and bottom rows; the bottom row's lies
  // higher for a card of several lines, so it snaps from further.
  const top = 0.05;
  const bottom = 0.92;
  if (Math.abs(box.y - top) < SNAP) [out.y, snapY, row] = [top, top, 'top'];
  else if (Math.abs(cy - 0.5) < SNAP) [out.y, snapY, row] = [0.5 - box.height / 2, 0.5, 'middle'];
  else if (Math.abs(box.y + box.height - bottom) < 2 * SNAP)
    [out.y, snapY, row] = [bottom - box.height, bottom, 'bottom'];
  const named = side && row ? (`${row}-${side}` as Position) : null;
  return {
    box: out,
    snapX,
    snapY,
    named: named && POSITIONS.includes(named) ? named : null,
  };
}

/** Keeps a box inside the frame. */
const inside = (box: FrameBox): FrameBox => ({
  ...box,
  x: Math.min(Math.max(box.x, 0), Math.max(0, 1 - box.width)),
  y: Math.min(Math.max(box.y, 0), Math.max(0, 1 - box.height)),
});

const layer = ref<HTMLElement | null>(null);

/** Starts dragging a block, or with `resize` its corner handle. */
function start(event: PointerEvent, block: Block, box: FrameBox, resize: boolean): void {
  if (event.button !== 0 || !layer.value) return;
  event.preventDefault();
  event.stopPropagation();
  selected.value = block;
  emit('select', block);
  const area = layer.value.getBoundingClientRect();
  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);
  const [x0, y0] = [event.clientX, event.clientY];
  let moved = false;
  const definition = BLOCKS.find((b) => b.id === block)!;
  const size0 = Number(adjustments.value[definition.size] ?? 100);

  const move = (e: PointerEvent) => {
    const dx = (e.clientX - x0) / area.width;
    const dy = (e.clientY - y0) / area.height;
    if (!moved && Math.hypot(e.clientX - x0, e.clientY - y0) < 4) return;
    moved = true;
    if (resize) {
      // The corner moves away from the top-left one: the block grows with the drag down.
      const scale = Math.max(0.2, (box.height + dy) / box.height);
      const grown = { ...box, width: box.width * scale, height: box.height * scale };
      moving.value = { block, box: inside(grown), snapX: null, snapY: null, named: null };
    } else {
      const snapped = snap(inside({ ...box, x: box.x + dx, y: box.y + dy }));
      moving.value = { block, ...snapped };
    }
  };
  const end = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', end);
    target.removeEventListener('pointercancel', end);
    if (!moved || !moving.value) return;
    const now = moving.value;
    if (resize) {
      const size = Math.round((size0 * (now.box.height / box.height)) / 5) * 5;
      set(definition.size, String(Math.min(200, Math.max(50, size))));
    } else {
      set(definition.position, now.named ?? framePointText(anchorOf(now.box)));
    }
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
}

function set(name: string, value: string): void {
  if (adjustments.value[name] === value) {
    moving.value = null;
    return;
  }
  emit('placed');
  adjustments.value = { ...adjustments.value, [name]: value };
}

/** Arrow keys move the block by 1% of the frame (Shift: 5%); + and - resize it. */
function key(event: KeyboardEvent, block: Block, box: FrameBox): void {
  const definition = BLOCKS.find((b) => b.id === block)!;
  const step = event.shiftKey ? 0.05 : 0.01;
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  const by = moves[event.key];
  if (by) {
    event.preventDefault();
    const now = inside({ ...box, x: box.x + by[0], y: box.y + by[1] });
    moving.value = { block, box: now, snapX: null, snapY: null, named: null };
    adjustments.value = {
      ...adjustments.value,
      [definition.position]: framePointText(anchorOf(now)),
    };
    return;
  }
  if (event.key === '+' || event.key === '-') {
    event.preventDefault();
    const size = Number(adjustments.value[definition.size] ?? 100);
    const next = Math.min(200, Math.max(50, size + (event.key === '+' ? 10 : -10)));
    adjustments.value = { ...adjustments.value, [definition.size]: String(next) };
  }
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
  <!-- Pressing the picture outside the blocks lets the selected one go. -->
  <div ref="layer" class="layer" @pointerdown.self="selected = null">
    <!-- What Instagram's own controls cover on a Reel or Story, as Meta's ads guide gives it:
         14% at the top, 35% at the bottom, 6% at each side. -->
    <div v-if="story && (selected || moving)" class="guides" aria-hidden="true">
      <span class="zone top" />
      <span class="zone bottom" />
      <span class="zone left" />
      <span class="zone right" />
    </div>
    <span
      v-if="moving?.snapX !== null && moving?.snapX !== undefined"
      class="line across"
      :style="{ left: `${moving.snapX * 100}%` }"
      aria-hidden="true"
    />
    <span
      v-if="moving?.snapY !== null && moving?.snapY !== undefined"
      class="line down"
      :style="{ top: `${moving.snapY * 100}%` }"
      aria-hidden="true"
    />
    <div
      v-for="b in shown"
      :key="b.id"
      class="block"
      :class="{ selected: selected === b.id, moving: moving?.block === b.id }"
      :style="place(moving?.block === b.id ? moving.box : b.box)"
      role="button"
      tabindex="0"
      :aria-label="`${b.label}: drag to move it; arrow keys move it, plus and minus resize it`"
      :aria-pressed="selected === b.id"
      :data-testid="`edit-${b.id}`"
      @pointerdown="start($event, b.id, b.box, false)"
      @focus="selected = b.id"
      @keydown="key($event, b.id, b.box)"
    >
      <span class="name" aria-hidden="true">{{ b.label }}</span>
      <span
        v-if="selected === b.id"
        class="handle"
        :data-testid="`resize-${b.id}`"
        aria-hidden="true"
        @pointerdown="start($event, b.id, b.box, true)"
      />
    </div>
  </div>
</template>

<style scoped>
.layer {
  position: absolute;
  inset: 0;
  touch-action: none;
}

/* An outline around each block, faint until it is picked. */
.block {
  position: absolute;
  box-sizing: content-box;
  margin: -4px;
  padding: 3px;
  border: 1px dashed rgba(255, 255, 255, 0.45);
  border-radius: 4px;
  cursor: grab;
  touch-action: none;
}

.block.selected,
.block.moving,
.block:focus-visible {
  border: 1px solid var(--accent);
  outline: none;
  background: rgba(255, 138, 42, 0.08);
}

.block.moving {
  cursor: grabbing;
}

/* The block's name on a tab above its outline. */
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
}

.block.selected .name,
.block.moving .name,
.block:hover .name {
  opacity: 1;
}

/* The corner that resizes: a square on the bottom right, larger than it looks for fingers. */
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

.handle::after {
  content: '';
  position: absolute;
  inset: -10px;
}

/* A line the block snapped to. */
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
