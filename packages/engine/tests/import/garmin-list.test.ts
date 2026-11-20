import { describe, expect, it } from 'vitest';
import { findGarminEntry, parseGarminList } from '../../src/import/garmin-list.ts';

const list = (summaries: object[]) => JSON.stringify([{ summarizedActivitiesExport: summaries }]);

describe('parseGarminList', () => {
  it('reads id, name, sport and time span, in the app’s sport names', () => {
    const entries = parseGarminList(
      list([
        {
          activityId: 1,
          name: 'Commute',
          activityType: 'road_biking',
          beginTimestamp: 1000,
          elapsedDuration: 5000,
        },
        { activityId: 2, name: 'Swim', activityType: 'lap_swimming', beginTimestamp: 9000 },
        { activityId: 3, name: 'Odd one', activityType: 'pickleball', beginTimestamp: 20000 },
        { name: 'No id', beginTimestamp: 30000 },
      ]),
    );

    expect(entries).toEqual([
      { id: 'garmin-1', name: 'Commute', sport: 'ride', start: 1000, end: 6000 },
      { id: 'garmin-2', name: 'Swim', sport: 'swim', start: 9000, end: 9000 },
      // Not a known type: the activity file's own sport is used.
      { id: 'garmin-3', name: 'Odd one', sport: '', start: 20000, end: 20000 },
    ]);
  });

  it('rejects a file that is not an activity list', () => {
    expect(() => parseGarminList('{"userName":"someone"}')).toThrow('not a Garmin activity list');
    expect(() => parseGarminList('not json')).toThrow();
  });
});

describe('findGarminEntry', () => {
  const entry = (id: string, start: number, end: number) => ({
    id,
    name: id,
    sport: '',
    start,
    end,
  });
  const entries = [entry('a', 0, 3_600_000), entry('b', 3_000_000, 5_000_000)];

  it('finds the activity whose time span holds the first position', () => {
    expect(findGarminEntry(entries, 600_000)?.id).toBe('a');
    // The first position can come a while after the start, when the GPS took long.
    expect(findGarminEntry(entries, 4_900_000)?.id).toBe('b');
  });

  it('takes the later start where spans overlap, and nothing outside them', () => {
    expect(findGarminEntry(entries, 3_100_000)?.id).toBe('b');
    expect(findGarminEntry(entries, 6_000_000)).toBeNull();
  });

  it('uses start slack only if no activity has started and picks the closest start', () => {
    expect(findGarminEntry(entries, 2_990_000)?.id).toBe('a');
    const upcoming = [entry('next', 25_000, 26_000), entry('first', 15_000, 16_000)];
    expect(findGarminEntry(upcoming, 10_000)?.id).toBe('first');
  });
});
