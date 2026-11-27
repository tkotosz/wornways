import { describe, expect, it } from 'vitest';
import type { Widget } from '../../src/replay/widgets.ts';
import {
  AUTOMATIC_TOTALS,
  totalsEntries,
  totalsEntry,
  totalsValues,
  totalsWidgetHeight,
  type Totals,
} from '../../src/replay/totals-card.ts';

describe('totalsEntries', () => {
  const totals: Totals = {
    activities: 5,
    meters: 312_400,
    movingSeconds: 14.5 * 3600,
    totalSeconds: 18 * 3600,
    climbed: 4210,
    descended: 4105,
    highest: 1445,
    lowest: 102,
    days: 6,
    movingDays: 4,
    topSpeed: 15,
    each: {
      meters: [112_300, 80_000, 60_000, 40_100, 20_000],
      seconds: [5.25 * 3600, 4 * 3600, 3.5 * 3600, 3 * 3600, 2.25 * 3600],
      climbed: [1830, 1000, 700, 480, 200],
      calories: [2200, 1500, 1200, 820, 400],
    },
    heartRate: 141.6,
    maxHeartRate: 178,
    minHeartRate: 62,
    power: 212.4,
    maxPower: 640,
    cadence: 84.6,
    maxCadence: 118,
    temperature: 21.2,
    minTemperature: 9,
    maxTemperature: 31.4,
    calories: 6120,
    onFoot: false,
    firstStart: new Date(2026, 3, 18, 8).getTime(),
    lastStart: new Date(2026, 3, 22, 9).getTime(),
  };
  const rides: [string, string] = ['ride', 'rides'];
  /** The entries as "value / label", for short expectations. */
  const shown = (fields: Parameters<typeof totalsEntries>[3], of = totals, f = 1) =>
    totalsEntries(of, f, rides, fields, 'metric').map((e) => `${e.value} / ${e.label}`);

  it('shows the totals unless told otherwise, each named for what it is', () => {
    expect(totalsEntries(totals, 1, rides, AUTOMATIC_TOTALS, 'metric')).toEqual([
      { field: 'count', value: '5', number: '5', label: 'rides', name: 'Total activities' },
      {
        field: 'distance',
        value: '312 km',
        number: '312',
        label: 'total distance',
        name: 'Total distance',
      },
      {
        field: 'moving',
        value: '15 h',
        number: '15',
        label: 'total moving time',
        name: 'Total moving time',
      },
      {
        field: 'climb',
        value: '4,210 m',
        number: '4,210',
        label: 'total climb',
        name: 'Total climb',
      },
    ]);
  });

  it('adds up the time with stops, the descent and the calories, and counts the days', () => {
    expect(shown(['time', 'descent', 'calories', 'days', 'moving-days'])).toEqual([
      '18 h / total time',
      '4,105 m / total descent',
      '6,120 kcal / total calories',
      '6 / days',
      '4 / moving days',
    ]);
    expect(shown(['days', 'moving-days'], { ...totals, days: 1, movingDays: 1 })).toEqual([
      '1 / day',
      '1 / moving day',
    ]);
  });

  it('tells the avg, max and min per activity of time, distance, climb and calories', () => {
    expect(
      shown([
        'avg-time',
        'max-time',
        'min-time',
        'avg-distance',
        'max-distance',
        'min-distance',
        'avg-climb',
        'max-climb',
        'min-climb',
        'avg-calories',
        'max-calories',
        'min-calories',
      ]),
    ).toEqual([
      '3.6 h / avg time per ride',
      '5.3 h / max time per ride',
      '2.3 h / min time per ride',
      '62.5 km / avg distance per ride',
      '112.3 km / max distance per ride',
      '20.0 km / min distance per ride',
      '842 m / avg climb per ride',
      '1,830 m / max climb per ride',
      '200 m / min climb per ride',
      '1,224 kcal / avg calories per ride',
      '2,200 kcal / max calories per ride',
      '400 kcal / min calories per ride',
    ]);
    const [max] = totalsEntries(totals, 1, rides, ['max-distance'], 'metric');
    expect(max!.name).toBe('Max distance per activity');
  });

  it('tells the avg and max speed, or pace when every activity is on foot', () => {
    expect(shown(['avg-speed', 'max-speed'], totals, 0.2)).toEqual([
      '21.5 km/h / avg speed',
      '54.0 km/h / max speed',
    ]);
    // 42.2 km in 3:30 moving: 4:59 per kilometer; 5 m/s is 3:20 per kilometer.
    const runs = {
      ...totals,
      onFoot: true,
      meters: 42_200,
      movingSeconds: 3.5 * 3600,
      topSpeed: 5,
    };
    expect(shown(['avg-speed', 'max-speed'], runs)).toEqual([
      '4:59 /km / avg pace',
      '3:20 /km / max pace',
    ]);
  });

  it('tells the max and min elevation', () => {
    expect(shown(['max-elevation', 'min-elevation'])).toEqual([
      '1,445 m / max elevation',
      '102 m / min elevation',
    ]);
  });

  it('shows the sensors: avg, max and min, each named for what it is', () => {
    expect(
      shown([
        'avg-heart-rate',
        'max-heart-rate',
        'min-heart-rate',
        'avg-power',
        'max-power',
        'avg-cadence',
        'max-cadence',
        'avg-temperature',
        'min-temperature',
        'max-temperature',
      ]),
    ).toEqual([
      '142 bpm / avg heart rate',
      '178 bpm / max heart rate',
      '62 bpm / min heart rate',
      '212 W / avg power',
      '640 W / max power',
      '85 rpm / avg cadence',
      '118 rpm / max cadence',
      '21 °C / avg temperature',
      '9 °C / min temperature',
      '31 °C / max temperature',
    ]);
    // On foot, one leg's strides become steps per minute.
    expect(shown(['avg-cadence'], { ...totals, onFoot: true })).toEqual(['169 spm / avg cadence']);
    const none = {
      ...totals,
      heartRate: null,
      maxHeartRate: null,
      minHeartRate: null,
      power: null,
      maxPower: null,
      cadence: null,
      maxCadence: null,
      temperature: null,
      minTemperature: null,
      maxTemperature: null,
      calories: null,
      each: { ...totals.each, calories: null },
    };
    expect(
      shown(
        [
          'avg-heart-rate',
          'max-power',
          'avg-cadence',
          'min-temperature',
          'calories',
          'avg-calories',
        ],
        none,
      ),
    ).toEqual([]);
  });

  it('shows the values picked, in the order picked', () => {
    expect(
      totalsEntries(totals, 1, rides, ['climb', 'count'], 'metric').map((e) => e.field),
    ).toEqual(['climb', 'count']);
  });

  it('shows the days spanned, and neither the dates nor the speed count up', () => {
    expect(shown(['date', 'avg-speed', 'distance'], totals, 0.2)).toEqual([
      '18–22 Apr 2026 / ',
      '21.5 km/h / avg speed',
      '62 km / total distance',
    ]);
  });

  it('writes a time in hours unless told otherwise, or as picked', () => {
    const moving = (format?: 'hms' | 'hm' | 'h' | 'd') =>
      totalsEntry(totals, 'moving', { f: 1, countLabel: rides, units: 'metric', format });
    expect(moving()).toMatchObject({ value: '15 h', number: '15', label: 'total moving time' });
    expect(moving('hms')).toMatchObject({ value: '14:30:00', number: '14:30:00' });
    expect(moving('hm')).toMatchObject({ value: '14:30' });
    expect(moving('d')).toMatchObject({ value: '0.6 days', number: '0.6' });
    const time = (format: 'hm' | 'h') =>
      totalsEntry(totals, 'time', { f: 1, countLabel: rides, units: 'metric', format });
    expect(time('hm')).toMatchObject({ value: '18:00', label: 'total time' });
    expect(time('h')).toMatchObject({ value: '18 h', label: 'total time' });
    const longest = totalsEntry(totals, 'max-time', {
      f: 1,
      countLabel: rides,
      units: 'metric',
      format: 'hm',
    });
    expect(longest).toMatchObject({ value: '5:15', label: 'max time per ride' });
  });

  it('writes the dates in the format picked', () => {
    const dates = (format: 'dmy' | 'dm' | 'wdm' | 'mdy' | 'iso') =>
      totalsEntry(totals, 'date', { f: 1, countLabel: rides, units: 'metric', format })!.value;
    expect(dates('dmy')).toBe('18–22 Apr 2026');
    expect(dates('dm')).toBe('18–22 Apr');
    expect(dates('wdm')).toBe('Sat 18 Apr – Wed 22 Apr');
    expect(dates('mdy')).toBe('Apr 18–22, 2026');
    expect(dates('iso')).toBe('2026-04-18 – 2026-04-22');
  });

  it('tells distances, heights, speeds and temperatures in imperial units', () => {
    const imperial = (fields: Parameters<typeof totalsEntries>[3], of = totals) =>
      totalsEntries(of, 1, rides, fields, 'imperial').map((e) => `${e.value} / ${e.label}`);
    expect(
      imperial([
        'distance',
        'climb',
        'avg-distance',
        'max-elevation',
        'avg-speed',
        'max-temperature',
      ]),
    ).toEqual([
      '194 mi / total distance',
      '13,812 ft / total climb',
      '38.8 mi / avg distance per ride',
      '4,741 ft / max elevation',
      '13.4 mph / avg speed',
      '89 °F / max temperature',
    ]);
    expect(imperial(['avg-speed'], { ...totals, onFoot: true })).toEqual(['4:29 /mi / avg pace']);
  });

  it('gives the editor every format of a time and a date', () => {
    const values = totalsValues(totals, rides, 'metric');
    expect(values.get('moving')).toMatchObject({ value: '15 h', name: 'Total moving time' });
    expect(values.get('moving')!.formats!.hm).toEqual({
      value: '14:30',
      number: '14:30',
      label: 'total moving time',
    });
    expect(values.get('date')!.formats!.mdy!.value).toBe('Apr 18–22, 2026');
    expect(values.get('distance')!.formats).toBeUndefined();
  });

  it('leaves out elevation when no activity recorded it, even when picked', () => {
    const flat = {
      ...totals,
      climbed: null,
      descended: null,
      highest: null,
      lowest: null,
      each: { ...totals.each, climbed: null },
    };
    expect(
      totalsEntries(
        flat,
        1,
        rides,
        ['climb', 'descent', 'distance', 'max-elevation', 'avg-climb'],
        'metric',
      ).map((e) => e.field),
    ).toEqual(['distance']);
  });
});

describe('totalsWidgetHeight', () => {
  it('is as high as a value with its words above or under it, or without them a line', () => {
    const value = (label: 'off' | 'before' | 'after' | 'above' | 'under'): Widget => ({
      kind: 'metric',
      metric: 'distance',
      label,
      x: 50,
      y: 50,
      size: 100,
    });
    const under = totalsWidgetHeight(value('under'), 1);
    expect(totalsWidgetHeight(value('above'), 1)).toBe(under);
    expect(totalsWidgetHeight(value('after'), 1)).toBeLessThan(under);
    expect(totalsWidgetHeight(value('before'), 1)).toBe(totalsWidgetHeight(value('off'), 1));
  });
});
