import { describe, expect, it } from 'vitest';
import { METRICS } from '../../src/replay/render.ts';
import { parseWidgets, widgetsText, type Widget } from '../../src/replay/widgets.ts';

describe('widgets as text', () => {
  const widgets: Widget[] = [
    { kind: 'text', text: 'Mallorca, "the island"', x: 50, y: 8, size: 100 },
    { kind: 'text', text: null, x: 50, y: 50, size: 140 },
    { kind: 'metric', metric: 'distance', x: 20.5, y: 88, size: 120 },
    { kind: 'elevation-chart', x: 50, y: 93, size: 100 },
  ];

  it('is written and read back as the same widgets', () => {
    const text = widgetsText(widgets);
    expect(text).toBe(
      'text:"Mallorca, \\"the island\\""@50,8;text@50,50,140;distance@20.5,88,120;elevation-chart@50,93',
    );
    expect(parseWidgets(text, METRICS)).toEqual(widgets);
  });

  it('takes percent signs and spaces, and nothing for no widgets', () => {
    expect(parseWidgets(' time@10%, 20% ; ', METRICS)).toEqual([
      { kind: 'metric', metric: 'time', x: 10, y: 20, size: 100 },
    ]);
    expect(parseWidgets('', METRICS)).toEqual([]);
  });

  it.each([
    ['speed@1,2', '"speed" is not a widget'],
    ['time@1', 'expected x,y or x,y,size in percent after "time@" at character 7'],
    ['time@120,2', 'a place is from 0 to 100 percent, got 120,2'],
    ['time@1,2,300', 'a size is from 50 to 250 percent, got 300'],
    ['distance:"x"@1,2', 'only a text widget takes text, not "distance"'],
    ['text:"open@1,2', 'the text has no closing double quote'],
  ])('rejects %j', (text, message) => {
    expect(() => parseWidgets(text, METRICS)).toThrow(message);
  });
});
