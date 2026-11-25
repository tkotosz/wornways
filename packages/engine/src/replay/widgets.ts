// What is drawn over the replay: widgets placed anywhere on the frame, as stickers are in a
// story editor. A widget is a line of text (the title, at first), one value (a metric), or
// the elevation chart. Each sits centered on a point of the frame, in percent of its width
// across and of its height down, at a size in percent of its normal size; centered, it keeps
// its place while its value grows and shrinks during the replay. They are drawn in order,
// the last on top.
//
// As text, a list is "name[:"text"]@x,y[,size]" items separated by ";", e.g.
// `text:"Mallorca"@50,8;distance@20,88,120;elevation-chart@50,93`. A text widget without
// its own text shows the video's title.

import type { Metric, Placement } from './render.ts';

export type Widget = { x: number; y: number; size: number } & (
  | { kind: 'text'; text: string | null }
  | { kind: 'metric'; metric: Metric }
  | { kind: 'elevation-chart' }
);

/** The sizes a widget takes, in percent of its normal size. */
export const WIDGET_SIZE = { min: 50, max: 250 } as const;

/** A widget's name in the text form: "text", "elevation-chart" or the metric's. */
export const widgetName = (widget: Widget) =>
  widget.kind === 'metric' ? widget.metric : widget.kind;

/**
 * Reads a list of widgets from its text form; an empty text is no widgets. `metrics` are
 * the metric names a value widget can take; `chart` whether the elevation chart is one
 * (not on the totals card). Throws an Error that says what is wrong.
 */
export function parseWidgets(
  text: string,
  metrics: readonly string[],
  { chart = true }: { chart?: boolean } = {},
): Widget[] {
  const widgets: Widget[] = [];
  let i = 0;
  const fail = (why: string): never => {
    throw new Error(`${why} at character ${i + 1}`);
  };
  const skipSpaces = () => {
    while (text[i] === ' ') i++;
  };
  while (i < text.length) {
    skipSpaces();
    if (i >= text.length) break;
    const nameStart = i;
    while (i < text.length && /[a-z-]/.test(text[i]!)) i++;
    const name = text.slice(nameStart, i);
    let own: string | null = null;
    if (text[i] === ':') {
      if (name !== 'text') fail(`only a text widget takes text, not "${name}"`);
      i++;
      if (text[i] !== '"') fail('expected the text in double quotes');
      i++;
      let value = '';
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length) i++;
        value += text[i];
        i++;
      }
      if (text[i] !== '"') fail('the text has no closing double quote');
      i++;
      own = value;
    }
    if (text[i] !== '@') fail(`expected @ and a place after "${name}"`);
    i++;
    const placeStart = i;
    while (i < text.length && text[i] !== ';') i++;
    const numbers = text
      .slice(placeStart, i)
      .split(',')
      .map((part) => part.trim().replace(/%$/, ''));
    if (numbers.length < 2 || numbers.length > 3 || numbers.some((n) => !/^\d+(\.\d+)?$/.test(n)))
      fail(`expected x,y or x,y,size in percent after "${name}@"`);
    const [x, y, size = 100] = numbers.map(Number) as [number, number, number?];
    if (x > 100 || y > 100) fail(`a place is from 0 to 100 percent, got ${x},${y}`);
    if (size < WIDGET_SIZE.min || size > WIDGET_SIZE.max)
      fail(`a size is from ${WIDGET_SIZE.min} to ${WIDGET_SIZE.max} percent, got ${size}`);
    if (name === 'text') widgets.push({ kind: 'text', text: own, x, y, size });
    else if (name === 'elevation-chart' && chart)
      widgets.push({ kind: 'elevation-chart', x, y, size });
    else if (metrics.includes(name))
      widgets.push({ kind: 'metric', metric: name as Metric, x, y, size });
    else
      fail(
        `"${name}" is not a widget: text, ${chart ? 'elevation-chart or ' : ''}one of ${metrics.join(', ')}`,
      );
    i++; // past the ";"
  }
  return widgets;
}

const round = (n: number) => Number(n.toFixed(1));

/** A list of widgets in the text form `parseWidgets` reads. */
export function widgetsText(widgets: Widget[]): string {
  return widgets
    .map((widget) => {
      const text =
        widget.kind === 'text' && widget.text !== null
          ? `:"${widget.text.replace(/[\\"]/g, (c) => `\\${c}`)}"`
          : '';
      const size = widget.size === 100 ? '' : `,${round(widget.size)}`;
      return `${widgetName(widget)}${text}@${round(widget.x)},${round(widget.y)}${size}`;
    })
    .join(';');
}

/** A widget's width and height as parts of the frame's, at its size. */
export type Measure = (widget: Widget) => { width: number; height: number };

/**
 * The widgets a video starts with when none are set: what the title, the metrics card and
 * the elevation profile settings describe. The title where its position puts it; the first
 * metric large and the others smaller in a row under it, where the card's position puts
 * them; the elevation chart along the bottom. Where the title and the values would meet,
 * they stack, the title first. `measure` gives each widget's size on the finished picture.
 */
export function startingWidgets(
  options: {
    title: boolean;
    titlePosition: Placement;
    titleSize: number;
    metrics: Metric[];
    metricsPosition: Placement;
    metricsSize: number;
    elevationChart: boolean;
  },
  measure: Measure,
): Widget[] {
  const margin = 7;
  const top = 5;
  const chart: Widget = { kind: 'elevation-chart', x: 50, y: 0, size: 100 };
  const chartSize = measure(chart);
  chart.y = 98.8 - 3.2 - (chartSize.height * 100) / 2;
  /** The lowest the bottom row's text may reach: above the chart when it shows. */
  const floor = options.elevationChart ? chart.y - (chartSize.height * 100) / 2 - 2.5 : 93;

  /** Where a block `width` wide (percent) starts across, on the side a position names. */
  const leftEdge = (place: Placement, width: number) => {
    if (typeof place !== 'string') return place.x - width / 2;
    if (place.endsWith('left')) return margin;
    if (place.endsWith('right')) return 100 - margin - width;
    return 50 - width / 2;
  };
  const rowOf = (place: Placement) =>
    typeof place !== 'string'
      ? 'free'
      : place.startsWith('top')
        ? 'top'
        : place.startsWith('middle')
          ? 'middle'
          : 'bottom';

  // The title, as one block.
  const title: Widget | null = options.title
    ? { kind: 'text', text: null, x: 0, y: 0, size: options.titleSize }
    : null;
  const titleBox = title ? measure(title) : { width: 0, height: 0 };
  const titleW = titleBox.width * 100;
  const titleH = titleBox.height * 100;

  // The values: the first large, the others in a row under it, as one block.
  const [first, ...rest] = options.metrics;
  const large: Widget | null = first
    ? { kind: 'metric', metric: first, x: 0, y: 0, size: options.metricsSize * 1.15 }
    : null;
  const small: Widget[] = rest.map((metric) => ({
    kind: 'metric',
    metric,
    x: 0,
    y: 0,
    size: options.metricsSize * 0.8,
  }));
  const gap = 3;
  const largeBox = large ? measure(large) : { width: 0, height: 0 };
  const smallBoxes = small.map(measure);
  const rowW = smallBoxes.reduce((sum, box) => sum + box.width * 100, 0) + gap * (small.length - 1);
  const rowH = Math.max(0, ...smallBoxes.map((box) => box.height * 100));
  const between = small.length ? 0.8 : 0;
  const blockW = Math.max(largeBox.width * 100, rowW);
  const blockH = largeBox.height * 100 + between + rowH;

  const titleRow = rowOf(options.titlePosition);
  const cardRow = rowOf(options.metricsPosition);
  const stacked = !!title && !!large && titleRow !== 'free' && titleRow === cardRow;

  /** The top of a block `height` tall in a row, or around a free point. */
  const topOf = (place: Placement, height: number) => {
    if (typeof place !== 'string') return place.y - height / 2;
    const row = rowOf(place);
    if (row === 'top') return top;
    if (row === 'middle') return 50 - height / 2;
    return floor - height;
  };

  let titleTop = title ? topOf(options.titlePosition, titleH) : 0;
  let cardTop = large ? topOf(options.metricsPosition, blockH) : 0;
  if (stacked) {
    const both = titleH + 1.5 + blockH;
    const start = topOf(options.titlePosition, both);
    titleTop = start;
    cardTop = start + titleH + 1.5;
  }

  const widgets: Widget[] = [];
  if (title) {
    const left = leftEdge(options.titlePosition, titleW);
    widgets.push({ ...title, x: left + titleW / 2, y: titleTop + titleH / 2 });
  }
  if (large) {
    const left = leftEdge(options.metricsPosition, blockW);
    // The large value and the row start at the block's left edge on the left, end at its
    // right edge on the right, and are centered in the middle.
    const side =
      typeof options.metricsPosition === 'string' && options.metricsPosition.endsWith('left')
        ? 'left'
        : typeof options.metricsPosition === 'string' && options.metricsPosition.endsWith('right')
          ? 'right'
          : 'center';
    const along = (width: number) =>
      side === 'left'
        ? left
        : side === 'right'
          ? left + blockW - width
          : left + (blockW - width) / 2;
    const largeW = largeBox.width * 100;
    widgets.push({
      ...large,
      x: along(largeW) + largeW / 2,
      y: cardTop + (largeBox.height * 100) / 2,
    });
    let x = along(rowW);
    const rowTop = cardTop + largeBox.height * 100 + between;
    small.forEach((widget, k) => {
      const width = smallBoxes[k]!.width * 100;
      widgets.push({ ...widget, x: x + width / 2, y: rowTop + rowH / 2 });
      x += width + gap;
    });
  }
  if (options.elevationChart) widgets.push(chart);
  return widgets.map((widget) => ({
    ...widget,
    x: Math.min(100, Math.max(0, widget.x)),
    y: Math.min(100, Math.max(0, widget.y)),
  }));
}
