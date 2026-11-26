import { describe, expect, it } from 'vitest';
import { METRICS } from '../../src/replay/render.ts';
import { TOTALS_FIELDS } from '../../src/replay/totals-card.ts';
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
      'text:"Mallorca, \\"the island\\""@50,8;text@50,50,140;distance:off@20.5,88,120;count@50,70;elevation-chart@50,93',
    );
    expect(parseWidgets(text, METRICS)).toEqual(widgets);
  });

  it('takes percent signs and spaces, and nothing for no widgets', () => {
    expect(parseWidgets(' time@10%, 20% ; ', METRICS)).toEqual([
      { kind: 'metric', metric: 'time', label: 'under', x: 10, y: 20, size: 100 },
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
    [
      'date:under@1,2',
      '"date" takes the label mode off or the format dmy, dm, wdm, mdy, iso, not "under"',
    ],
    ['moving:hm:hms@1,2', '"moving" takes the label mode off, inline, under or the format'],
    ['distance:hm@1,2', '"distance" takes the label mode off, inline, under, not "hm"'],
    ['elevation-chart:off@1,2', '"elevation-chart" takes no label mode'],
    ['text:"open@1,2', 'the text has no closing double quote'],
  ])('rejects %j', (text, message) => {
    expect(() => parseWidgets(text, METRICS)).toThrow(message);
  });
});

describe('formats', () => {
  it('takes a time, date or clock format after the label mode, or alone, and writes it back', () => {
    const text = 'moving:inline:hm@20,80;date:dm@50,8;start:12h@50,20;time@10,10';
    const widgets = parseWidgets(text, METRICS);
    expect(widgets.map((w) => (w.kind === 'metric' ? [w.label, w.format] : null))).toEqual([
      ['inline', 'hm'],
      ['off', 'dm'],
      ['under', '12h'],
      ['under', undefined],
    ]);
    expect(widgetsText(widgets)).toBe(text);
    // The usual format is not written.
    expect(widgetsText(parseWidgets('moving:hms@1,2', METRICS))).toBe('moving@1,2');
    // On the totals card a time is in hours unless told otherwise, and has no label mode.
    const card = parseWidgets('moving:hm@1,2;time:h@1,2', TOTALS_FIELDS, { labels: false });
    expect(widgetsText(card, { labels: false })).toBe('moving:hm@1,2;time@1,2');
  });

  it('writes a value in the format picked, its words and short form with it', () => {
    const longest = {
      value: '5:15:00',
      label: 'max time per ride',
      short: '5:15:00 max',
      name: 'Max time per activity',
      formats: {
        hm: { value: '5:15', label: 'max time per ride', short: '5:15 max' },
        d: { value: '0.2 days', label: 'max time per ride', short: '0.2 days max' },
      },
    };
    expect(valueLines(longest, 'under', 'hm')).toEqual({
      line: '5:15',
      under: 'max time per ride',
    });
    expect(valueLines(longest, 'short', 'd')).toEqual({ line: '0.2 days max', under: '' });
    expect(valueLines(longest, 'off')).toEqual({ line: '5:15:00', under: '' });
  });
});

describe('label modes', () => {
  it('start with the words under the value, except the date, which has none', () => {
    expect(defaultLabel('climb')).toBe('under');
    expect(defaultLabel('avg-heart-rate')).toBe('under');
    expect(defaultLabel('count')).toBe('under');
    expect(defaultLabel('distance')).toBe('under');
    expect(defaultLabel('date')).toBe('off');
    // A short form for the climb's arrows and the avg, max and min values.
    expect(labelModes('climb')).toEqual(['off', 'short', 'inline', 'under']);
    expect(labelModes('max-power')).toEqual(['off', 'short', 'inline', 'under']);
    expect(labelModes('count')).toEqual(['off', 'inline', 'under']);
  });

  it('write a value alone, in its short form, with its words after it or under it', () => {
    const climbed = { value: '1,200 m', label: 'climbed', short: '↑1,200 m', name: 'Climb' };
    expect(valueLines(climbed, 'off')).toEqual({ line: '1,200 m', under: '' });
    expect(valueLines(climbed, 'short')).toEqual({ line: '↑1,200 m', under: '' });
    expect(valueLines(climbed, 'inline')).toEqual({ line: '1,200 m climbed', under: '' });
    expect(valueLines(climbed, 'under')).toEqual({ line: '1,200 m', under: 'climbed' });
  });
});
