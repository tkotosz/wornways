import { describe, expect, it } from 'vitest';
import { totalsEntries, type Totals } from '../../src/replay/totals-card.ts';

describe('totalsEntries', () => {
  const totals: Totals = {
    activities: 5,
    meters: 312_400,
    movingSeconds: 14.5 * 3600,
    totalSeconds: 18 * 3600,
    climbed: 4210,
    descended: 4105,
    highest: 1445,
    days: 4,
    longest: 112_300,
    topSpeed: 15,
    heartRate: 141.6,
    maxHeartRate: 178,
    power: 212.4,
    cadence: 84.6,
    temperature: 21.2,
    calories: 6120,
    onFoot: false,
    dates: '18–22 Apr 2026',
  };
  const rides: [string, string] = ['ride', 'rides'];

  it('shows every value in the usual order unless told otherwise', () => {
    expect(totalsEntries(totals, 1, rides)).toEqual([
      { field: 'count', value: '5', label: 'rides' },
      { field: 'distance', value: '312', label: 'km' },
      { field: 'moving', value: '15', label: 'hours moving' },
      { field: 'elevation', value: '4,210', label: 'm climbed' },
    ]);
  });

  it('adds up the time in total, the descent, the highest point, the days and the longest', () => {
    expect(
      totalsEntries(totals, 1, rides, ['time', 'descent', 'highest', 'days', 'longest']),
    ).toEqual([
      { field: 'time', value: '18', label: 'hours in total' },
      { field: 'descent', value: '4,105', label: 'm descended' },
      { field: 'highest', value: '1,445', label: 'm highest point' },
      { field: 'days', value: '4', label: 'days out' },
      { field: 'longest', value: '112', label: 'km longest ride' },
    ]);
    const oneDay = { ...totals, days: 1 };
    expect(totalsEntries(oneDay, 1, rides, ['days'])[0]!.label).toBe('day out');
  });

  it('tells the top speed, or the best pace when every activity is on foot', () => {
    expect(totalsEntries(totals, 0.2, rides, ['top-speed'])).toEqual([
      { field: 'top-speed', value: '54.0', label: 'km/h top speed' },
    ]);
    // 5 m/s is 3:20 per kilometer.
    const runs = { ...totals, onFoot: true, topSpeed: 5 };
    expect(totalsEntries(runs, 1, rides, ['top-speed'])).toEqual([
      { field: 'top-speed', value: '3:20', label: 'min/km best pace' },
    ]);
  });

  it('shows the sensor averages, the highest heart rate and the calories', () => {
    const sensorValues = [
      'heart-rate',
      'max-heart-rate',
      'power',
      'cadence',
      'temperature',
      'calories',
    ] as const;
    expect(totalsEntries(totals, 1, rides, [...sensorValues])).toEqual([
      { field: 'heart-rate', value: '142', label: 'bpm average' },
      { field: 'max-heart-rate', value: '178', label: 'bpm max' },
      { field: 'power', value: '212', label: 'W average' },
      { field: 'cadence', value: '85', label: 'rpm average' },
      { field: 'temperature', value: '21', label: '°C average' },
      { field: 'calories', value: '6,120', label: 'kcal' },
    ]);
    // On foot, one leg's strides become steps per minute.
    expect(totalsEntries({ ...totals, onFoot: true }, 1, rides, ['cadence'])).toEqual([
      { field: 'cadence', value: '169', label: 'spm average' },
    ]);
    const none = {
      ...totals,
      heartRate: null,
      maxHeartRate: null,
      power: null,
      cadence: null,
      temperature: null,
      calories: null,
    };
    expect(totalsEntries(none, 1, rides, [...sensorValues])).toEqual([]);
  });

  it('shows the values picked, in the order picked', () => {
    expect(totalsEntries(totals, 1, rides, ['elevation', 'count']).map((e) => e.field)).toEqual([
      'elevation',
      'count',
    ]);
  });

  it('tells the average speed while moving, or the pace when every activity is on foot', () => {
    expect(totalsEntries(totals, 1, rides, ['pace'])).toEqual([
      { field: 'pace', value: '21.5', label: 'km/h average' },
    ]);
    // 42.2 km in 3:30 moving: 4:59 per kilometer.
    const runs = { ...totals, onFoot: true, meters: 42_200, movingSeconds: 3.5 * 3600 };
    expect(totalsEntries(runs, 1, rides, ['pace'])).toEqual([
      { field: 'pace', value: '4:59', label: 'min/km average' },
    ]);
  });

  it('shows the days spanned, and neither the dates nor the pace count up', () => {
    expect(totalsEntries(totals, 0.2, rides, ['date', 'pace', 'distance'])).toEqual([
      { field: 'date', value: '18–22 Apr 2026', label: 'dates' },
      { field: 'pace', value: '21.5', label: 'km/h average' },
      { field: 'distance', value: '62', label: 'km' },
    ]);
  });

  it('leaves out elevation when no activity recorded it, even when picked', () => {
    const flat = { ...totals, climbed: null, descended: null, highest: null };
    expect(
      totalsEntries(flat, 1, rides, ['elevation', 'descent', 'distance', 'highest']).map(
        (e) => e.field,
      ),
    ).toEqual(['distance']);
    expect(totalsEntries(flat, 1, rides, ['elevation'])).toEqual([]);
  });
});
