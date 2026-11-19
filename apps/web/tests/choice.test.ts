import { describe, expect, it } from 'vitest';
import {
  NO_CHOICE,
  choiceSettings,
  filterSettings,
  periodBounds,
  periodRange,
  placeMissing,
  placeSettings,
  toggledSports,
} from '../src/choice.ts';

const today = new Date(2026, 0, 15); // 15 January 2026

describe('periodBounds', () => {
  it.each([
    ['all', {}],
    ['today', { from: '2026-01-15', to: '2026-01-15' }],
    ['yesterday', { from: '2026-01-14', to: '2026-01-14' }],
    ['this-month', { from: '2026-01', to: '2026-01' }],
    ['last-month', { from: '2025-12', to: '2025-12' }],
    ['this-year', { from: '2026', to: '2026' }],
    ['last-year', { from: '2025', to: '2025' }],
  ] as const)('turns %s into %j', (period, bounds) => {
    expect(periodBounds({ ...NO_CHOICE, period }, today)).toEqual(bounds);
  });

  it('takes yesterday across a month and a year boundary', () => {
    const newYear = new Date(2026, 0, 1);

    expect(periodBounds({ ...NO_CHOICE, period: 'yesterday' }, newYear)).toEqual({
      from: '2025-12-31',
      to: '2025-12-31',
    });
  });

  it('uses the custom days, open where one is missing', () => {
    const choice = { ...NO_CHOICE, period: 'custom' as const, customFrom: '2025-08-01' };

    expect(periodBounds(choice, today)).toEqual({ from: '2025-08-01', to: undefined });
  });
});

describe('choiceSettings', () => {
  it('leaves out what the person did not choose', () => {
    expect(filterSettings(NO_CHOICE, today)).toEqual({ sport: undefined });
  });

  it('gives each place filter with its radius once it is on and its place is set', () => {
    const at = (place: string, radius = 1000) => ({ on: true, place, radius });

    expect(filterSettings({ ...NO_CHOICE, startNear: at('47.5,19.04', 500) }, today)).toEqual({
      sport: undefined,
      'start-near': '47.5,19.04',
      'start-radius': '500',
    });
    expect(
      filterSettings({ ...NO_CHOICE, startNear: at('47.5,19'), endNear: at('46.9,17.9') }, today),
    ).toMatchObject({ 'start-near': '47.5,19', 'end-near': '46.9,17.9', 'end-radius': '1000' });
    // Without a place the filter waits instead of guessing one; switched off, it is left out.
    const waiting = { ...NO_CHOICE, endNear: at('') };
    expect(filterSettings(waiting, today)['end-near']).toBeUndefined();
    expect(placeMissing(waiting)).toBe(true);
    const off = { ...NO_CHOICE, endNear: { ...at('46.9,17.9'), on: false } };
    expect(filterSettings(off, today)['end-near']).toBeUndefined();
    expect(placeMissing(off)).toBe(false);
  });

  it('passes exact IDs when activities are unticked or distance is filtered', () => {
    const choice = { ...NO_CHOICE, sports: ['ride', 'run'], excluded: ['b', 'x'] };

    expect(choiceSettings(choice, ['a', 'b', 'c'], today)).toMatchObject({
      sport: 'ride,run',
      activity: ['a', 'c'],
    });
    expect(choiceSettings(NO_CHOICE, ['a', 'b'], today).activity).toBeUndefined();
    expect(choiceSettings({ ...NO_CHOICE, minDistanceKm: '5' }, ['a,b'], today).activity).toEqual([
      'a,b',
    ]);
  });
});

describe('placeSettings', () => {
  it('keeps the period and sports but not the place filters', () => {
    const choice = {
      ...NO_CHOICE,
      period: 'last-month' as const,
      sports: ['ride'],
      startNear: { on: true, place: '47.5,19.04', radius: 1000 },
    };

    expect(placeSettings(choice, today)).toEqual({ from: '2025-12', to: '2025-12', sport: 'ride' });
  });
});

describe('periodRange', () => {
  it('reads the period as moments, the end exclusive', () => {
    expect(periodRange({ ...NO_CHOICE, period: 'last-month' }, today)).toEqual({
      from: new Date(2025, 11, 1).getTime(),
      to: new Date(2026, 0, 1).getTime(),
    });
    expect(periodRange(NO_CHOICE, today)).toEqual({ from: null, to: null });
  });

  it('gives null for a period that cannot be read', () => {
    const backwards = {
      ...NO_CHOICE,
      period: 'custom' as const,
      customFrom: '2026-03-10',
      customTo: '2026-03-01',
    };

    expect(periodRange(backwards, today)).toBeNull();
  });
});

describe('toggledSports', () => {
  it('picks a sport instead of "All", and adds or removes the next ones', () => {
    expect(toggledSports(NO_CHOICE, 'ride')).toEqual(['ride']);
    expect(toggledSports({ ...NO_CHOICE, sports: ['ride'] }, 'run')).toEqual(['ride', 'run']);
    expect(toggledSports({ ...NO_CHOICE, sports: ['ride', 'run'] }, 'ride')).toEqual(['run']);
  });

  it('goes back to "All" when the last sport is unpicked', () => {
    expect(toggledSports({ ...NO_CHOICE, sports: ['ride'] }, 'ride')).toBeNull();
  });
});

describe('distanceText', () => {
  it.each([
    [500, '500 m'],
    [1000, '1 km'],
    [1500, '1.5 km'],
    [20000, '20 km'],
  ])('writes %d m as %s', async (meters, text) => {
    const { distanceText } = await import('../src/format.ts');
    expect(distanceText(meters)).toBe(text);
  });
});
