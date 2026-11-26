// Layouts: ready-made places for the widgets over the replay, as slots for the title, the
// stats and a chart. A video starts with its widgets arranged in its layout (each preset has
// one), and the web app shows the slots as guides while the widgets are arranged, for them to
// snap to; the slots themselves are never drawn in the video.
//
// The slots are planned on a story frame (9:16) in percent of it, and fitted to any other
// frame: a slot keeps its size in pixels against the frame's shorter side, and its place
// against the edge or middle it hangs from.

import { WIDGET_SIZE, type Widget } from './widgets.ts';

/** A layout over the replay. */
export type OverlayLayoutName =
  'classic' | 'bottom-row' | 'corner-grid' | 'hero' | 'side-column' | 'story-safe';
/** A layout of the totals card: its values as a grid, a column or a row, the title over them. */
export type CardLayoutName = 'grid-2x2' | 'grid-2x3' | 'grid-2x4' | 'column' | 'row';
export type LayoutName = OverlayLayoutName | CardLayoutName;
export const CARD_LAYOUT_NAMES: readonly CardLayoutName[] = [
  'grid-2x2',
  'grid-2x3',
  'grid-2x4',
  'column',
  'row',
];
export const LAYOUT_NAMES: readonly OverlayLayoutName[] = [
  'classic',
  'bottom-row',
  'corner-grid',
  'hero',
  'side-column',
  'story-safe',
];

/** What a slot holds: the title (a text widget), a stat, or a chart. */
export type SlotKind = 'title' | 'stat' | 'chart';

/**
 * A slot on a frame, in percent of it: its middle and its size; and whether a widget sits in
 * its middle or against its left edge.
 */
export type LayoutSlot = {
  kind: SlotKind;
  x: number;
  y: number;
  width: number;
  height: number;
  align: 'left' | 'center';
};

/**
 * A slot as planned on a story frame (1080 x 1920), in percent of it, and what it hangs from
 * across (the left edge, the middle or the right edge) and down (the top, the middle or the
 * bottom), which it keeps on another frame.
 */
type PlannedSlot = Omit<LayoutSlot, 'align'> & {
  across: 'left' | 'middle' | 'right';
  down: 'top' | 'middle' | 'bottom';
  align?: 'left' | 'center';
  /** Runs across the frame (the title, a chart along it): keeps its width in percent. */
  spans?: boolean;
};

const title: PlannedSlot = {
  kind: 'title',
  x: 50,
  y: 6.5,
  width: 84,
  height: 4,
  across: 'middle',
  down: 'top',
  spans: true,
};
/** A chart along the bottom, the full width less the margins. */
const bottomChart: PlannedSlot = {
  kind: 'chart',
  x: 50,
  y: 94.5,
  width: 86,
  height: 4.2,
  across: 'middle',
  down: 'bottom',
  spans: true,
};
/** A stat hanging from the bottom, `width` and `height` in percent of a story frame. */
const stat = (
  x: number,
  y: number,
  width: number,
  height: number,
  across: PlannedSlot['across'],
  align: 'left' | 'center' = across === 'left' ? 'left' : 'center',
  down: PlannedSlot['down'] = 'bottom',
): PlannedSlot => ({ kind: 'stat', x, y, width, height, across, down, align });

/**
 * The totals card's layouts, centered on the frame: the values in rows of two (2x2, 2x3,
 * 2x4), one under another, or side by side, the title over them. A value is planned 8.5% of a
 * story frame high, the rows 11.5% apart.
 */
function cardLayouts(): Record<
  CardLayoutName,
  { name: string; help: string; slots: PlannedSlot[] }
> {
  const PITCH = 11.5;
  const HIGH = 8.5;
  const centered = (x: number, y: number, width: number): PlannedSlot => ({
    kind: 'stat',
    x,
    y,
    width,
    height: HIGH,
    across: 'middle',
    down: 'middle',
    align: 'center',
  });
  /** `rows` rows of `columns` values, centered, and the title over them. */
  const grid = (rows: number, columns: 1 | 2): PlannedSlot[] => {
    const top = 50 - ((rows - 1) * PITCH) / 2;
    const xs = columns === 2 ? [29, 71] : [50];
    return [
      {
        kind: 'title',
        x: 50,
        y: top - PITCH - 0.5,
        width: 84,
        height: 5,
        across: 'middle',
        down: 'middle',
        spans: true,
      },
      ...Array.from({ length: rows }, (_, row) =>
        xs.map((x) => centered(x, top + row * PITCH, columns === 2 ? 38 : 60)),
      ).flat(),
    ];
  };
  return {
    'grid-2x2': {
      name: '2 × 2',
      help: 'Four values in two rows of two, the title over them.',
      slots: grid(2, 2),
    },
    'grid-2x3': {
      name: '2 × 3',
      help: 'Six values in three rows of two, the title over them.',
      slots: grid(3, 2),
    },
    'grid-2x4': {
      name: '2 × 4',
      help: 'Eight values in four rows of two, the title over them.',
      slots: grid(4, 2),
    },
    column: {
      name: 'Column',
      help: 'Four values one under another, the title over them.',
      slots: grid(4, 1),
    },
    row: {
      name: 'Row',
      help: 'Four values side by side, for a wide frame, the title over them.',
      slots: [
        {
          kind: 'title',
          x: 50,
          y: 38,
          width: 84,
          height: 5,
          across: 'middle',
          down: 'middle',
          spans: true,
        },
        ...[14.5, 38.2, 61.8, 85.5].map((x) => centered(x, 50, 22)),
      ],
    },
  };
}

/** Each layout's name and slots; stats fill the stat slots in order, the first the largest. */
export const LAYOUTS: Record<LayoutName, { name: string; help: string; slots: PlannedSlot[] }> = {
  classic: {
    name: 'Classic',
    help: 'The title at the top; a large stat at the bottom left with a row of three under it; a chart along the bottom.',
    slots: [
      title,
      stat(26, 80, 38, 6.5, 'left'),
      stat(16, 87.5, 18, 4.4, 'left'),
      stat(36, 87.5, 18, 4.4, 'left'),
      stat(56, 87.5, 18, 4.4, 'left'),
      bottomChart,
    ],
  },
  'bottom-row': {
    name: 'Bottom row',
    help: 'The title at the top; up to four stats side by side at the bottom, a chart over them.',
    slots: [
      title,
      stat(14.5, 88, 22, 6, 'middle'),
      stat(38.2, 88, 22, 6, 'middle'),
      stat(61.8, 88, 22, 6, 'middle'),
      stat(85.5, 88, 22, 6, 'middle'),
      { ...bottomChart, y: 80.5, height: 4.5 },
    ],
  },
  'corner-grid': {
    name: 'Corner grid',
    help: 'The title at the top; four stats two by two at the bottom left; a chart along the bottom.',
    slots: [
      title,
      stat(18, 80, 23, 6, 'left'),
      stat(43, 80, 23, 6, 'left'),
      stat(18, 88, 23, 6, 'left'),
      stat(43, 88, 23, 6, 'left'),
      bottomChart,
    ],
  },
  hero: {
    name: 'Hero',
    help: 'The title at the top; one large stat in the middle at the bottom, three smaller under it; a chart along the bottom.',
    slots: [
      title,
      stat(50, 79.5, 60, 7.5, 'middle'),
      stat(22, 87.5, 26, 4.6, 'middle'),
      stat(50, 87.5, 26, 4.6, 'middle'),
      stat(78, 87.5, 26, 4.6, 'middle'),
      bottomChart,
    ],
  },
  'side-column': {
    name: 'Side column',
    help: 'The title at the top; the stats one under another down the left side; a chart along the bottom.',
    slots: [
      title,
      stat(20, 38, 30, 6.5, 'left', 'left', 'middle'),
      stat(20, 47, 30, 6.5, 'left', 'left', 'middle'),
      stat(20, 56, 30, 6.5, 'left', 'left', 'middle'),
      stat(20, 65, 30, 6.5, 'left', 'left', 'middle'),
      bottomChart,
    ],
  },
  'story-safe': {
    name: 'Story safe',
    help: 'Clear of what Instagram and TikTok cover on a story (the top 14%, the bottom 35%): the title near the top, a chart in the middle and up to four stats just under it.',
    slots: [
      { ...title, y: 18 },
      stat(15.5, 58, 21, 6, 'middle', 'center', 'middle'),
      stat(38.5, 58, 21, 6, 'middle', 'center', 'middle'),
      stat(61.5, 58, 21, 6, 'middle', 'center', 'middle'),
      stat(84.5, 58, 21, 6, 'middle', 'center', 'middle'),
      { ...bottomChart, y: 50, width: 76, height: 5, down: 'middle' },
    ],
  },
  ...cardLayouts(),
};

/** The margin a slot hangs from, in percent of a story frame. */
const EDGE = { left: 7, right: 93, top: 4, bottom: 97 } as const;

/**
 * The slots of `layout` on a frame of `width` by `height` pixels: each keeps its size against
 * the frame's shorter side, and its distance from what it hangs from scales the same way.
 */
export function layoutSlots(
  layout: LayoutName,
  { width, height }: { width: number; height: number },
): LayoutSlot[] {
  const short = Math.min(width, height);
  // How a percent of a story frame's width and height turns into a percent of this frame's.
  const kx = short / width;
  const ky = ((short / height) * 16) / 9;
  const place = (at: number, from: number, k: number) => from + (at - from) * k;
  /** A middle kept so its slot stays inside the frame. */
  const inside = (at: number, size: number) => Math.min(100 - size / 2, Math.max(size / 2, at));
  return LAYOUTS[layout].slots.map((slot) => {
    const w = slot.spans ? slot.width : Math.min(100, slot.width * kx);
    const h = Math.min(100, slot.height * ky);
    const x = slot.spans
      ? slot.x
      : place(slot.x, { left: EDGE.left, middle: 50, right: EDGE.right }[slot.across], kx);
    const y = place(slot.y, { top: EDGE.top, middle: 50, bottom: EDGE.bottom }[slot.down], ky);
    return {
      kind: slot.kind,
      x: inside(x, w),
      y: inside(y, h),
      width: w,
      height: h,
      align: slot.align ?? 'center',
    };
  });
}

const sized = (size: number) =>
  Math.round(Math.min(WIDGET_SIZE.max, Math.max(WIDGET_SIZE.min, size)));

/**
 * The stat slots `count` stats take: the first ones, a row of centered slots that is not full
 * spread evenly about the row's middle, so two stats in a row of three sit balanced.
 */
function statSlotsFor(slots: LayoutSlot[], count: number): LayoutSlot[] {
  const taken = slots.slice(0, count);
  return taken.map((slot) => {
    if (slot.align !== 'center') return slot;
    const row = slots.filter((other) => Math.abs(other.y - slot.y) < 0.01);
    const used = taken.filter((other) => Math.abs(other.y - slot.y) < 0.01);
    if (used.length === row.length || row.length < 2) return slot;
    const step = (row.at(-1)!.x - row[0]!.x) / (row.length - 1);
    const middle = (row[0]!.x + row.at(-1)!.x) / 2;
    const at = used.indexOf(slot);
    return { ...slot, x: middle + (at - (used.length - 1) / 2) * step };
  });
}

/**
 * `widgets` arranged in `slots`: the title (a text widget without a text of its own, else the
 * first text) in the title slot, the stats in the stat slots in order, a chart in the chart
 * slot, each sized to fit its slot and placed in it. A widget without a slot left for it stays
 * as it is. `measure` gives a widget's width and height as parts of the frame's at its
 * normal size (100%, a chart's height too), with its place in `widgets`.
 */
export function arrangeInLayout(
  widgets: Widget[],
  slots: LayoutSlot[],
  measure: (widget: Widget, index: number) => { width: number; height: number },
): Widget[] {
  const free = { title: [] as LayoutSlot[], stat: [] as LayoutSlot[], chart: [] as LayoutSlot[] };
  for (const slot of slots) free[slot.kind].push(slot);
  free.stat = statSlotsFor(free.stat, widgets.filter((widget) => widget.kind === 'metric').length);
  // The title: the text that shows it, else the first text.
  const titled = widgets.findIndex((widget) => widget.kind === 'text' && widget.text === null);
  const titleAt = titled >= 0 ? titled : widgets.findIndex((widget) => widget.kind === 'text');
  return widgets.map((widget, k) => {
    let kind: SlotKind | null = null;
    if (widget.kind === 'metric') kind = 'stat';
    else if (widget.kind === 'chart') kind = 'chart';
    else if (k === titleAt) kind = 'title';
    const slot = kind ? free[kind].shift() : undefined;
    if (!slot) return widget;
    // Its width and height at its normal size, in percent of the frame.
    const normal = measure(
      { ...widget, size: 100, ...(widget.kind === 'chart' ? { height: undefined } : {}) } as Widget,
      k,
    );
    const w = normal.width * 100;
    const h = normal.height * 100;
    if (widget.kind === 'chart') {
      const size = sized((slot.width / w) * 100);
      const height = sized((slot.height / h) * 100);
      return {
        ...widget,
        x: slot.x,
        y: slot.y,
        size,
        height: height === size ? undefined : height,
      };
    }
    const size = sized(Math.min(slot.width / w, slot.height / h) * 100);
    const width = (w * size) / 100;
    const x = slot.align === 'left' ? slot.x - slot.width / 2 + width / 2 : slot.x;
    return { ...widget, x, y: slot.y, size };
  });
}
