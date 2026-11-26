import { describe, expect, it } from 'vitest';
import { METRICS } from '../../src/replay/render.ts';
import {
  defaultLabel,
  labelModes,
  parseWidgets,
  valueLines,
  widgetsText,
  type Widget,
} from '../../src/replay/widgets.ts';

describe('widgets as text', () => {
  const widgets: Widget[] = [
    { kind: 'text', text: 'Mallorca, "the island"', x: 50, y: 8, size: 100 },
    { kind: 'text', text: null, x: 50, y: 50, size: 140 },
    { kind: 'metric', metric: 'distance', label: 'off', x: 20.5, y: 88, size: 120 },
    { kind: 'metric', metric: 'count', label: 'under', x: 50, y: 70, size: 100 },
    { kind: 'elevation-chart', x: 50, y: 93, size: 100 },
  ];

  it('is written and read back as the same widgets, a label mode only when not the usual', () => {
    const text = widgetsText(widgets);
    expect(text).toBe(
      'text:"Mallorca, \\"the island\\""@50,8;text@50,50,140;distance@20.5,88,120;count:under@50,70;elevation-chart@50,93',
    );
    expect(parseWidgets(text, METRICS)).toEqual(widgets);
  });

  it('takes percent signs and spaces, and nothing for no widgets', () => {
    expect(parseWidgets(' time@10%, 20% ; ', METRICS)).toEqual([
      { kind: 'metric', metric: 'time', label: 'off', x: 10, y: 20, size: 100 },
    ]);
    expect(parseWidgets('', METRICS)).toEqual([]);
  });

  it.each([
    ['speed@1,2', '"speed" is not a widget'],
    ['time@1', 'expected x,y or x,y,size in percent after "time@" at character 7'],
    ['time@120,2', 'a place is from 0 to 100 percent, got 120,2'],
    ['time@1,2,300', 'a size is from 50 to 250 percent, got 300'],
    ['distance:"x"@1,2', '"distance" takes the label mode off, inline, under, not ""'],
    ['distance:short@1,2', '"distance" takes the label mode off, inline, under, not "short"'],
    ['date:under@1,2', '"date" takes the label mode off, not "under"'],
    ['elevation-chart:off@1,2', '"elevation-chart" takes no label mode'],
    ['text:"open@1,2', 'the text has no closing double quote'],
  ])('rejects %j', (text, message) => {
    expect(() => parseWidgets(text, METRICS)).toThrow(message);
  });
});

describe('label modes', () => {
  it('start the way each value usually reads: a short form, the words inline, or none', () => {
    expect(defaultLabel('elevation')).toBe('short');
    expect(defaultLabel('heart-rate')).toBe('short');
    expect(defaultLabel('count')).toBe('inline');
    expect(defaultLabel('days')).toBe('inline');
    expect(defaultLabel('distance')).toBe('off');
    expect(defaultLabel('date')).toBe('off');
    expect(labelModes('elevation')).toEqual(['off', 'short', 'inline', 'under']);
    expect(labelModes('count')).toEqual(['off', 'inline', 'under']);
  });

  it('write a value alone, in its short form, with its words after it or under it', () => {
    const climbed = { value: '1,200 m', label: 'climbed', short: '↑1,200 m' };
    expect(valueLines(climbed, 'off')).toEqual({ line: '1,200 m', under: '' });
    expect(valueLines(climbed, 'short')).toEqual({ line: '↑1,200 m', under: '' });
    expect(valueLines(climbed, 'inline')).toEqual({ line: '1,200 m climbed', under: '' });
    expect(valueLines(climbed, 'under')).toEqual({ line: '1,200 m', under: 'climbed' });
  });
});
