import { describe, expect, it } from 'vitest';
import { movingSeconds, totalsEntries, type Totals } from '../../src/replay/totals-card.ts';
import { STRIDE } from '../../src/track/types.ts';

/** A track heading east: a point every 10 s, each `stepDeg` of longitude after the one before. */
function track(steps: number[]) {
  const points = new Float64Array((steps.length + 1) * STRIDE);
  let lon = 19;
  points.set([lon, 47.5, 0, 0], 0);
  steps.forEach((step, i) => {
    lon += step;
    points.set([lon, 47.5, 0, (i + 1) * 10], (i + 1) * STRIDE);
  });
  return { points };
}

describe('movingSeconds', () => {
  it('counts the time between points covered at walking speed or faster', () => {
    // 0.0004° of longitude is about 30 m: 3 m/s. Standing still in between does not count.
    expect(movingSeconds(track([0.0004, 0.0004, 0, 0, 0.0004]))).toBe(30);
  });

  it('leaves out creeping slower than half a meter a second', () => {
    // About 2 m in 10 s.
    expect(movingSeconds(track([0.00003, 0.00003]))).toBe(0);
  });
});

describe('totalsEntries', () => {
  const totals: Totals = {
    activities: 5,
    meters: 312_400,
    movingSeconds: 14.5 * 3600,
    climbed: 4210,
    onFoot: false,
    dates: '18–22 Apr 2026',
  };
  const rides: [string, string] = ['ride', 'rides'];

  it('shows every value in the usual order unless told otherwise', () => {
    expect(totalsEntries(totals, 1, rides)).toEqual([
      { field: 'count', value: '5', label: 'rides' },
      { field: 'distance', value: '312', label: 'km' },
      { field: 'time', value: '15', label: 'hours moving' },
      { field: 'elevation', value: '4,210', label: 'm climbed' },
    ]);
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
    const flat = { ...totals, climbed: null };
    expect(totalsEntries(flat, 1, rides, ['elevation', 'distance']).map((e) => e.field)).toEqual([
      'distance',
    ]);
    expect(totalsEntries(flat, 1, rides, ['elevation'])).toEqual([]);
  });
});
