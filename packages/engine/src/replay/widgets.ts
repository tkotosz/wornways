// What is drawn over the replay: widgets placed anywhere on the frame, as stickers are in a
// story editor. A widget is a line of text (the title, at first), one value (a metric), or
// the elevation chart. Each sits centered on a point of the frame, in percent of its width
// across and of its height down, at a size in percent of its normal size; centered, it keeps
// its place while its value grows and shrinks during the replay. They are drawn in order,
// the last on top.
//
// As text, a list is "name[:"text"|:label]@x,y[,size]" items separated by ";", e.g.
// `text:"Mallorca"@50,8;distance@20,88,120;count:under@50,70;elevation-chart@50,93`. A text
// widget without its own text shows the video's title; a value without a label mode shows
// its words the way that value usually does (`defaultLabel`).

import type { Metric, MetricValue } from './render.ts';

/**
 * How a value shows its words: not at all ("1,147 km"), in a short form of its own
 * ("↑1,200 m", "142 bpm avg"), after the value on its line ("25 activities"), or on a line
 * under it.
 */
export type LabelMode = 'off' | 'short' | 'inline' | 'under';
export const LABEL_MODES: readonly LabelMode[] = ['off', 'short', 'inline', 'under'];

export type Widget = { x: number; y: number; size: number } & (
  | { kind: 'text'; text: string | null }
  | { kind: 'metric'; metric: Metric; label: LabelMode }
  | { kind: 'elevation-chart' }
);

/** The values that have a short form of their own: an arrow, "avg", "max", "best", "top". */
const SHORT_FORMS: readonly Metric[] = [
  'top-speed',
  'elevation',
  'descent',
  'highest',
  'lowest',
  'biggest-climb',
  'longest',
  'heart-rate',
  'max-heart-rate',
  'power',
  'max-power',
  'cadence',
  'max-cadence',
  'temperature',
  'min-temperature',
  'max-temperature',
];

/** The label modes `metric` can take: the date has no words; only some have a short form. */
export function labelModes(metric: Metric): LabelMode[] {
  if (metric === 'date') return ['off'];
  return LABEL_MODES.filter((mode) => mode !== 'short' || SHORT_FORMS.includes(metric));
}

/** The label mode a value starts with: its words under it; the date has none. */
export function defaultLabel(metric: Metric): LabelMode {
  return metric === 'date' ? 'off' : 'under';
}

/** What a value widget writes: its line, and the words under it (empty for none). */
export function valueLines(value: MetricValue, mode: LabelMode): { line: string; under: string } {
  if (mode === 'short') return { line: value.short ?? value.value, under: '' };
  if (mode === 'inline' && value.label) return { line: `${value.value} ${value.label}`, under: '' };
  if (mode === 'under') return { line: value.value, under: value.label };
  return { line: value.value, under: '' };
}

/** The sizes a widget takes, in percent of its normal size. */
export const WIDGET_SIZE = { min: 50, max: 250 } as const;

/** A widget's name in the text form: "text", "elevation-chart" or the metric's. */
export const widgetName = (widget: Widget) =>
  widget.kind === 'metric' ? widget.metric : widget.kind;

/**
 * Reads a list of widgets from its text form; an empty text is no widgets. `metrics` are
 * the metric names a value widget can take; `chart` whether the elevation chart is one and
 * `labels` whether values take a label mode (neither on the totals card, whose values always
 * have their words under them). Throws an Error that says what is wrong.
 */
export function parseWidgets(
  text: string,
  metrics: readonly string[],
  { chart = true, labels = true }: { chart?: boolean; labels?: boolean } = {},
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
    let label: LabelMode | null = null;
    if (text[i] === ':' && name !== 'text') {
      if (!labels || !metrics.includes(name)) fail(`"${name}" takes no label mode`);
      i++;
      const modeStart = i;
      while (i < text.length && /[a-z]/.test(text[i]!)) i++;
      const mode = text.slice(modeStart, i) as LabelMode;
      const modes = labelModes(name as Metric);
      if (!modes.includes(mode))
        fail(`"${name}" takes the label mode ${modes.join(', ')}, not "${mode}"`);
      label = mode;
    } else if (text[i] === ':') {
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
      widgets.push({
        kind: 'metric',
        metric: name as Metric,
        label: label ?? (labels ? defaultLabel(name as Metric) : 'under'),
        x,
        y,
        size,
      });
    else
      fail(
        `"${name}" is not a widget: text, ${chart ? 'elevation-chart or ' : ''}one of ${metrics.join(', ')}`,
      );
    i++; // past the ";"
  }
  return widgets;
}

const round = (n: number) => Number(n.toFixed(1));

/**
 * A list of widgets in the text form `parseWidgets` reads, with the same `labels`: a value's
 * label mode is written when it is not the value's usual one.
 */
export function widgetsText(
  widgets: Widget[],
  { labels = true }: { labels?: boolean } = {},
): string {
  return widgets
    .map((widget) => {
      const text =
        widget.kind === 'text' && widget.text !== null
          ? `:"${widget.text.replace(/[\\"]/g, (c) => `\\${c}`)}"`
          : labels && widget.kind === 'metric' && widget.label !== defaultLabel(widget.metric)
            ? `:${widget.label}`
            : '';
      const size = widget.size === 100 ? '' : `,${round(widget.size)}`;
      return `${widgetName(widget)}${text}@${round(widget.x)},${round(widget.y)}${size}`;
    })
    .join(';');
}

/** A widget's width and height as parts of the frame's, at its size. */
export type Measure = (widget: Widget) => { width: number; height: number };

/**
 * The widgets a video starts with when none are set: the title at the top, in the middle; the
 * values at the bottom left, the first large and the others smaller in a row under it; the
 * elevation chart along the bottom, with the values above it. `metrics` are the values in
 * order; `measure` gives each widget's size on the finished picture.
 */
export function startingWidgets(
  options: { title: boolean; metrics: Metric[]; elevationChart: boolean },
  measure: Measure,
): Widget[] {
  const margin = 7;
  const top = 5;
  const chart: Widget = { kind: 'elevation-chart', x: 50, y: 0, size: 100 };
  const chartSize = measure(chart);
  chart.y = 98.8 - 3.2 - (chartSize.height * 100) / 2;
  /** The lowest the bottom row's text may reach: above the chart when it shows. */
  const floor = options.elevationChart ? chart.y - (chartSize.height * 100) / 2 - 2.5 : 93;

  const widgets: Widget[] = [];
  if (options.title) {
    const title: Widget = { kind: 'text', text: null, x: 50, y: 0, size: 100 };
    title.y = top + (measure(title).height * 100) / 2;
    widgets.push(title);
  }

  // The values: the first large, the others in a row under it, as one block from the left.
  const [first, ...rest] = options.metrics;
  if (first) {
    const large: Widget = {
      kind: 'metric',
      metric: first,
      label: defaultLabel(first),
      x: 0,
      y: 0,
      size: 100 * 1.15,
    };
    const small: Widget[] = rest.map((metric) => ({
      kind: 'metric',
      metric,
      label: defaultLabel(metric),
      x: 0,
      y: 0,
      size: 100 * 0.8,
    }));
    const gap = 3;
    const largeBox = measure(large);
    const smallBoxes = small.map(measure);
    const rowH = Math.max(0, ...smallBoxes.map((box) => box.height * 100));
    const between = small.length ? 0.8 : 0;
    const blockH = largeBox.height * 100 + between + rowH;
    const cardTop = floor - blockH;
    widgets.push({
      ...large,
      x: margin + (largeBox.width * 100) / 2,
      y: cardTop + (largeBox.height * 100) / 2,
    });
    let x = margin;
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
