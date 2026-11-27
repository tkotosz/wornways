import { describe, expect, it } from 'vitest';
import {
  CARD_LAYOUT_NAMES,
  LAYOUTS,
  LAYOUT_NAMES,
  arrangeInLayout,
  layoutSlots,
} from '../../src/replay/layouts.ts';
import { parseSettings } from '../../src/replay/settings.ts';
import type { Widget } from '../../src/replay/widgets.ts';

const story = { width: 1080, height: 1920 };
const wide = { width: 1920, height: 1080 };

describe('layout slots', () => {
  it('are as planned on a story frame', () => {
    const slots = layoutSlots('bottom-row', story);
    expect(slots.map((slot) => slot.kind)).toEqual([
      'title',
      'stat',
      'stat',
      'stat',
      'stat',
      'chart',
    ]);
    expect(slots[1]).toMatchObject({ x: 14.5, y: 88, width: 22, height: 6, align: 'center' });
  });

  it('keep their size against the shorter side on another frame, a chart its full width', () => {
    const slots = layoutSlots('classic', wide);
    const chart = slots.find((slot) => slot.kind === 'chart')!;
    expect(chart.width).toBe(86);
    // A stat as many pixels wide: a smaller part of the wider frame; as far from the left
    // edge in pixels; as tall, a larger part of the lower frame.
    const big = slots[1]!;
    expect(big.width).toBeCloseTo(38 * (1080 / 1920));
    expect(big.x - big.width / 2).toBeCloseTo(7, 0);
    expect(big.height).toBeCloseTo(6.5 * (16 / 9));
  });

  it('stay inside the frame in every layout and shape', () => {
    for (const name of LAYOUT_NAMES)
      for (const frame of [story, wide, { width: 1080, height: 1080 }])
        for (const slot of layoutSlots(name, frame)) {
          expect(slot.x - slot.width / 2, `${name}`).toBeGreaterThanOrEqual(0);
          expect(slot.x + slot.width / 2, `${name}`).toBeLessThanOrEqual(100);
          expect(slot.y - slot.height / 2, `${name}`).toBeGreaterThanOrEqual(0);
          expect(slot.y + slot.height / 2, `${name}`).toBeLessThanOrEqual(100);
        }
  });

  it('are each named and described', () => {
    for (const name of LAYOUT_NAMES) {
      expect(LAYOUTS[name].name).not.toBe('');
      expect(LAYOUTS[name].help).toMatch(/\.$/);
    }
  });
});

describe("the totals card's layouts", () => {
  it('center their values in rows of two, one under another, or side by side', () => {
    const kinds = (name: Parameters<typeof layoutSlots>[0]) =>
      layoutSlots(name, story).filter((slot) => slot.kind === 'stat');
    expect(kinds('grid-2x2')).toHaveLength(4);
    expect(kinds('grid-2x3')).toHaveLength(6);
    expect(kinds('grid-2x4')).toHaveLength(8);
    expect(new Set(kinds('column').map((slot) => slot.x))).toEqual(new Set([50]));
    expect(new Set(kinds('row').map((slot) => slot.y))).toEqual(new Set([50]));
    // Centered down the frame.
    const ys = kinds('grid-2x3').map((slot) => slot.y);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(50);
  });

  it('stay inside the frame, also two by four on a wide one', () => {
    for (const name of CARD_LAYOUT_NAMES)
      for (const slot of layoutSlots(name, wide)) {
        expect(slot.y - slot.height / 2).toBeGreaterThanOrEqual(0);
        expect(slot.y + slot.height / 2).toBeLessThanOrEqual(100);
      }
  });
});

describe('arranging in a layout', () => {
  const stat = (metric: 'distance' | 'time' | 'climb'): Widget => ({
    kind: 'metric',
    metric,
    label: 'under',
    x: 10,
    y: 10,
    size: 100,
  });
  /** Every widget 20% wide and 4% high at its normal size. */
  const measure = () => ({ width: 0.2, height: 0.04 });

  it('puts the title, the stats in order and the chart in their slots, sized to fit', () => {
    const widgets: Widget[] = [
      stat('distance'),
      { kind: 'text', text: null, x: 10, y: 10, size: 100 },
      stat('time'),
      stat('climb'),
      { kind: 'chart', chart: 'elevation', x: 10, y: 10, size: 100 },
    ];
    const [distance, title, time, climb, chart] = arrangeInLayout(
      widgets,
      layoutSlots('bottom-row', story),
      measure,
    );
    expect(title).toMatchObject({ x: 50, y: 6.5, size: 100 });
    // Three stats in the row of four: spread evenly about its middle, each fitted to its slot.
    expect(distance).toMatchObject({ y: 88, size: 110 });
    expect(distance!.x).toBeCloseTo(26.33, 1);
    expect(time).toMatchObject({ x: 50, y: 88 });
    expect(climb!.x).toBeCloseTo(73.67, 1);
    // A chart fills its slot both ways: 86% wide, 4.5% high.
    expect(chart).toMatchObject({ x: 50, y: 80.5, size: 250, height: 113 });
  });

  it('sets a stat against the left of a left-aligned slot', () => {
    const [distance] = arrangeInLayout([stat('distance')], layoutSlots('classic', story), measure);
    // The big slot: 38% wide from 7%; the stat 20% wide at 100%, so its size fits its height.
    const size = distance!.size;
    expect(distance!.x - (20 * size) / 100 / 2).toBeCloseTo(7, 0);
  });

  it('balances a row it does not fill, and leaves a widget without a slot as it was', () => {
    const arranged = arrangeInLayout(
      [stat('distance'), stat('time'), stat('climb')],
      layoutSlots('hero', story),
      measure,
    );
    // The large slot, then two of the row of three: about its middle.
    expect(arranged[1]!.x + arranged[2]!.x).toBeCloseTo(100);
    const five = arrangeInLayout(
      [stat('distance'), stat('time'), stat('climb'), stat('distance'), stat('time')],
      layoutSlots('bottom-row', story),
      measure,
    );
    expect(five[4]).toMatchObject({ x: 10, y: 10 });
  });
});

describe('presets', () => {
  it('each start the widgets in a layout of their own', () => {
    expect(parseSettings({}).layout).toBe('classic');
    expect(parseSettings({ preset: 'recap' }).layout).toBe('classic');
    expect(parseSettings({ preset: 'all-at-once' }).layout).toBe('hero-pair');
    expect(parseSettings({ preset: 'recap', layout: 'story-safe' }).layout).toBe('story-safe');
  });
});
