import { describe, expect, it } from 'vitest';
import { automaticTitle, planReplay, videoFileName } from '../../src/replay/plans.ts';
import { parseSettings } from '../../src/replay/settings.ts';
import { STRIDE, type Track } from '../../src/track/types.ts';

/**
 * A one-hour activity heading east that starts at noon (local time) on the given day:
 * 10 km, or `km` kilometers.
 */
function activity(year: number, month: number, day: number, name = 'Lunch Ride', km = 10): Track {
  const count = 361;
  const points = new Float64Array(count * STRIDE);
  const step = 0.00037 * (km / 10);
  for (let i = 0; i < count; i++) points.set([19 + i * step, 47.5, 0, i * 10], i * STRIDE);
  const startTime = new Date(year, month - 1, day, 12).getTime();
  return { id: `${year}-${month}-${day}`, name, sport: 'ride', startTime, points };
}

const august = [activity(2026, 8, 1), activity(2026, 8, 2), activity(2026, 8, 4)];

describe('planReplay', () => {
  /** Whether each group starts once the one before it has finished. */
  const noOverlap = (windows: { start: number; duration: number }[]) =>
    windows.every(
      (w, i) => i === 0 || w.start >= windows[i - 1]!.start + windows[i - 1]!.duration - 1e-9,
    );

  it('gives each activity an even share of the exact duration in turn', () => {
    const plan = planReplay(august, parseSettings({ 'end-card': false }));

    // 30 s, less 0.4 s before the first and 2.5 s on the finished picture.
    expect(plan.note).toBe('3 activities at 9.03 s each');
    expect(plan.timeline.duration).toBe(30);
    expect(plan.groups).toEqual({
      count: 3,
      unit: 'activity',
      shortest: expect.closeTo(9.033, 2),
      longest: expect.closeTo(9.033, 2),
      race: false,
    });
    expect(noOverlap(plan.timeline.windows!)).toBe(true);
    expect(plan.timeline.label?.(1)).toBe('1 Aug 2026');
  });

  it('starts the next group early with overlap, still filling the duration exactly', () => {
    const plan = planReplay(august, parseSettings({ overlap: '40', 'end-card': false }));
    const [a, b, c] = plan.timeline.windows!;

    // Each next activity starts when the one before is 60% drawn.
    expect(b!.start).toBeCloseTo(a!.start + a!.duration * 0.6);
    expect(c!.start).toBeCloseTo(b!.start + b!.duration * 0.6);
    // The last one ends where the finished picture starts: 30 s less 2.5 s.
    expect(c!.start + c!.duration).toBeCloseTo(27.5);
    // So each is on screen longer than without overlap (9.03 s).
    expect(a!.duration).toBeCloseTo(27.1 / 2.2, 2);
    expect(plan.note).toBe('3 activities at 12.32 s each, overlapping 40%');
    expect(plan.timeline.label?.(a!.start + a!.duration * 0.7)).toBe('2 Aug 2026');
  });

  it('keeps every overlapping group inside the duration, long ones first too', () => {
    const rides = [activity(2026, 8, 1, 'Long', 80), activity(2026, 8, 2), activity(2026, 8, 3)];
    const plan = planReplay(
      rides,
      parseSettings({ share: 'distance', overlap: '80', 'end-card': false }),
    );
    const ends = plan.timeline.windows!.map((w) => w.start + w.duration);

    expect(Math.max(...ends)).toBeLessThanOrEqual(27.5 + 1e-9);
  });

  it('holds the finished picture only briefly when the end card follows', () => {
    for (const settings of [{}, { group: 'all', 'group-pace': 'real' }]) {
      const plan = planReplay(august, parseSettings(settings));
      const last = (t: number) => plan.timeline.progress(2, t);

      // The end card fades in from the finished picture, so it holds 0.3 s, not 2.5 s.
      expect(plan.timeline.duration).toBe(30);
      expect(last(30 - 0.4)).toBeLessThan(1);
      expect(last(30 - 0.3)).toBeCloseTo(1, 5);
    }
    expect(planReplay([august[0]!], parseSettings({})).note).toMatch(/played in 14\.3 s/);
  });

  it('groups automatically when activities would get less than 1.5 s', () => {
    const busy = Array.from({ length: 28 }, (_, i) => activity(2026, 8, 1 + i));
    const plan = planReplay(busy, parseSettings({ duration: '20' }));

    // 28 activities (and 28 days) in 17.6 s are too fast; 5 weeks are not.
    expect(plan.groups).toMatchObject({ count: 5, unit: 'week' });
    expect(plan.timeline.duration).toBe(20);
    expect(plan.timeline.label?.(0)).toBe('27 Jul – 2 Aug 2026');
  });

  it('starts the activities of one group together', () => {
    const sameDay = [activity(2026, 8, 1), activity(2026, 8, 1), activity(2026, 8, 3)];
    const plan = planReplay(sameDay, parseSettings({ group: 'day' }));
    const [a, b, c] = plan.timeline.windows!;

    expect(plan.groups).toMatchObject({ count: 2, unit: 'day' });
    expect(b).toEqual(a);
    expect(c!.start).toBeCloseTo(a!.start + a!.duration);
  });

  it('labels a month group with the month', () => {
    const plan = planReplay(august, parseSettings({ group: 'month', 'end-card': false }));

    expect(plan.note).toBe('1 month at 27.1 s each');
    expect(plan.timeline.label?.(5)).toBe('August 2026');
  });

  it('gives more time to longer groups when sharing by distance', () => {
    const rides = [activity(2026, 8, 1, 'Short', 10), activity(2026, 8, 2, 'Long', 40)];
    const [short, long] = planReplay(rides, parseSettings({ share: 'distance' })).timeline.windows!;

    // Time grows with the square root of the distance: four times as far, twice as long.
    expect(long!.duration / short!.duration).toBeCloseTo(2, 1);
    expect(long!.start).toBeCloseTo(short!.start + short!.duration);
  });

  it('makes one group at real pace a race, exactly as long as asked', () => {
    const plan = planReplay(
      august,
      parseSettings({ group: 'all', 'group-pace': 'real', duration: '45' }),
    );

    expect(plan.timeline.mode).toBe('race');
    expect(plan.timeline.clock).toBeDefined();
    expect(plan.timeline.duration).toBe(45);
    expect(plan.groups).toMatchObject({ count: 1, unit: 'all', race: true });
  });

  it('plays all activities in one group, finishing together, at the fitted pace', () => {
    const plan = planReplay(august, parseSettings({ group: 'all' }));
    const [a, b, c] = plan.timeline.windows!;

    expect(plan.timeline.mode).toBe('chronological');
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(plan.timeline.label?.(5)).toBe('1–4 Aug 2026');
  });

  it('races each group at real pace when there are several', () => {
    // Two days: a one-hour ride and a two-hour one on the first, one ride on the second.
    const long = activity(2026, 8, 1, 'Long');
    long.points = long.points.map((v, i) => (i % 4 === 3 ? v * 2 : v));
    const rides = [activity(2026, 8, 1), long, activity(2026, 8, 3)];
    const plan = planReplay(rides, parseSettings({ group: 'day', 'group-pace': 'real' }));
    const [short, longer, next] = plan.timeline.windows!;
    const middle = short!.start + short!.duration / 2;
    const end = short!.start + short!.duration;

    expect(plan.timeline.clock).toBeUndefined();
    expect(plan.groups).toMatchObject({ count: 2, unit: 'day', race: false });
    // Same start; the shorter ride is done before the end of the day's time, the longer
    // one only at its end; the next day starts after.
    expect(longer!.start).toBe(short!.start);
    expect(plan.timeline.progress(0, middle)).toBeGreaterThan(plan.timeline.progress(1, middle));
    expect(plan.timeline.progress(0, end - 0.5)).toBe(1);
    expect(plan.timeline.progress(1, end - 0.5)).toBeLessThan(1);
    expect(plan.timeline.progress(1, end)).toBeCloseTo(1, 5);
    expect(plan.timeline.progress(2, next!.start)).toBe(0);
  });

  it('plays a single activity at its own pace, whatever the grouping', () => {
    for (const group of ['auto', 'all']) {
      const plan = planReplay([august[0]!], parseSettings({ group, 'group-pace': 'real' }));

      expect(plan.note).toMatch(/^one activity, 1\.0 h played in/);
      expect(plan.timeline.duration).toBe(15);
      expect(plan.groups).toBeUndefined();
    }
  });
});

describe('automaticTitle', () => {
  it.each([
    [{ from: '2026-08', to: '2026-08' }, 'August 2026'],
    [{ from: '2026', to: '2026' }, '2026'],
    [{ from: '2026-08-01', to: '2026-08-14' }, '1–14 Aug 2026'],
    [{}, '1–4 Aug 2026'],
  ])('names the period for %j', (input, title) => {
    expect(automaticTitle(august, parseSettings(input))).toBe(title);
  });

  it('uses the name of a single activity', () => {
    expect(automaticTitle([august[0]!], parseSettings({}))).toBe('Lunch Ride');
  });
});

describe('videoFileName', () => {
  it.each([
    [{ from: '2026-08', to: '2026-08' }, 'month-2026-08.mp4'],
    [{ from: '2026', to: '2026' }, 'year-2026.mp4'],
    [{ from: '2026-08-01', to: '2026-08-14' }, 'replay-2026-08-01-to-2026-08-14.mp4'],
    [{}, 'replay-2026-08-01-to-2026-08-04.mp4'],
  ])('names the video of %j', (input, name) => {
    expect(videoFileName(august, parseSettings(input))).toBe(name);
  });

  it('names a single activity by its id', () => {
    expect(videoFileName([august[0]!], parseSettings({}))).toBe('activity-2026-8-1.mp4');
  });
});
