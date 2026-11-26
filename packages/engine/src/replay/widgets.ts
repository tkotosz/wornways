// What is drawn over the replay: widgets placed anywhere on the frame, as stickers are in a
// story editor. A widget is a line of text (the title, at first), one value (a metric), or
// the elevation chart. Each sits centered on a point of the frame, in percent of its width
// across and of its height down, at a size in percent of its normal size; centered, it keeps
// its place while its value grows and shrinks during the replay. They are drawn in order,
// the last on top.
//
// As text, a list is "name[:"text"|:label][:"words"][:nounit][:icon][:format]@x,y[,size]" items
// separated by ";", e.g. `text:"Mallorca"@50,8;distance:above:"so far"@20,88;moving:after:hm@50,70`.
// A text widget without its own text shows the video's title; a value without a label mode
// shows its words where that value usually does (`defaultLabel`), without words of its own
// the value's usual ones, and without a format the usual way (`defaultFormat`, formats.ts).

import { defaultFormat, formatsOf, type ValueFormat } from './formats.ts';
import type { Metric, MetricValue } from './metrics.ts';

/**
 * Where a value shows its words: not at all ("1,147 km"), before or after the value on its
 * line ("total distance 1,147 km", "25 activities"), or smaller on a line above or under it.
 */
export type LabelMode = 'off' | 'before' | 'after' | 'above' | 'under';
export const LABEL_MODES: readonly LabelMode[] = ['off', 'before', 'after', 'above', 'under'];

export type Widget = { x: number; y: number; size: number } & (
  | { kind: 'text'; text: string | null }
  | {
      kind: 'metric';
      metric: Metric;
      label: LabelMode;
      /** Its own words, in place of the value's usual ones; left out, the usual ones. */
      labelText?: string;
      /** False to write the number without its unit ("1,147" for 1,147 km). */
      unit?: boolean;
      /** True to draw its kind's icon in front of its line (see icons.ts). */
      icon?: boolean;
      /** How a time, date or clock time is written; left out, the value's usual way. */
      format?: ValueFormat;
    }
  | { kind: 'elevation-chart' }
);

/** The label mode a value starts with: its words under it; the date, which has none, off. */
export function defaultLabel(metric: Metric): LabelMode {
  return metric === 'date' ? 'off' : 'under';
}

/** Whether a value has a unit to leave out, in `format`: "1,147 km" has, "25" has not. */
export function hasUnit(shown: MetricValue, format?: ValueFormat): boolean {
  const text = (format && shown.formats?.[format]) || shown;
  return text.number !== text.value;
}

/** A value widget's words: its own, else the value's usual ones in `format`. */
export function labelTextOf(shown: MetricValue, labelText?: string, format?: ValueFormat): string {
  if (labelText !== undefined) return labelText;
  return ((format && shown.formats?.[format]) || shown).label;
}

/**
 * What a value widget writes, in `format` where the value has it, with `labelText` for its
 * words when given and without its unit when `unit` is false: its line, and the smaller words
 * above and under it (empty for none).
 */
export function valueLines(
  shown: MetricValue,
  mode: LabelMode,
  format?: ValueFormat,
  labelText?: string,
  unit = true,
): { above: string; line: string; under: string } {
  const text = (format && shown.formats?.[format]) || shown;
  const value = unit ? text.value : text.number;
  const words = labelTextOf(shown, labelText, format);
  if (!words || mode === 'off') return { above: '', line: value, under: '' };
  if (mode === 'before') return { above: '', line: `${words} ${value}`, under: '' };
  if (mode === 'after') return { above: '', line: `${value} ${words}`, under: '' };
  if (mode === 'above') return { above: words, line: value, under: '' };
  return { above: '', line: value, under: words };
}

/** The sizes a widget takes, in percent of its normal size. */
export const WIDGET_SIZE = { min: 50, max: 250 } as const;

/** A widget's name in the text form: "text", "elevation-chart" or the metric's. */
export const widgetName = (widget: Widget) =>
  widget.kind === 'metric' ? widget.metric : widget.kind;

/**
 * Reads a list of widgets from its text form; an empty text is no widgets. `metrics` are
 * the metric names a value widget can take; `chart` whether the elevation chart is one.
 * Throws an Error that says what is wrong.
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
  /** Reads a text in double quotes, where a backslash keeps the next character as it is. */
  const quoted = (): string => {
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
    return value;
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
    let labelText: string | null = null;
    let noUnit = false;
    let icon = false;
    let format: ValueFormat | null = null;
    if (text[i] === ':' && metrics.includes(name)) {
      // A value's label mode, its words in double quotes, nounit and its format, each once,
      // in any order.
      const modes = LABEL_MODES;
      const formats = formatsOf(name as Metric);
      const takes = [
        `the label mode ${modes.join(', ')}`,
        'its words in double quotes',
        'nounit',
        'icon',
        ...(formats.length ? [`the format ${formats.join(', ')}`] : []),
      ];
      while (text[i] === ':') {
        i++;
        if (text[i] === '"' && labelText === null) {
          labelText = quoted();
          continue;
        }
        const tokenStart = i;
        while (i < text.length && /[a-z0-9]/.test(text[i]!)) i++;
        const token = text.slice(tokenStart, i);
        if (label === null && modes.includes(token as LabelMode)) label = token as LabelMode;
        else if (token === 'nounit' && !noUnit) noUnit = true;
        else if (token === 'icon' && !icon) icon = true;
        else if (format === null && formats.includes(token as ValueFormat))
          format = token as ValueFormat;
        else fail(`"${name}" takes ${takes.join(', ')}, not "${token}"`);
      }
    } else if (text[i] === ':' && name === 'text') {
      i++;
      own = quoted();
    } else if (text[i] === ':') fail(`"${name}" takes no label mode`);
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
        label: label ?? defaultLabel(name as Metric),
        ...(labelText === null ? {} : { labelText }),
        ...(noUnit ? { unit: false } : {}),
        ...(icon ? { icon: true } : {}),
        ...(format ? { format } : {}),
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
/** A text in double quotes, a quote or backslash in it kept with a backslash. */
const quote = (text: string) => `"${text.replace(/[\\"]/g, (c) => `\\${c}`)}"`;

/**
 * A list of widgets in the text form `parseWidgets` reads: a value's label mode and format are
 * written when not the value's usual ones, on the totals card (`card`) a time's usual format
 * being hours.
 */
export function widgetsText(widgets: Widget[], { card = false }: { card?: boolean } = {}): string {
  return widgets
    .map((widget) => {
      let text = '';
      if (widget.kind === 'text' && widget.text !== null) text = `:${quote(widget.text)}`;
      if (widget.kind === 'metric') {
        if (widget.label !== defaultLabel(widget.metric)) text += `:${widget.label}`;
        if (widget.labelText !== undefined) text += `:${quote(widget.labelText)}`;
        if (widget.unit === false) text += ':nounit';
        if (widget.icon) text += ':icon';
        if (widget.format && widget.format !== defaultFormat(widget.metric, card))
          text += `:${widget.format}`;
      }
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
