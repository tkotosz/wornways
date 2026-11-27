import { describe, expect, it } from 'vitest';
import {
  clockTimeText,
  dateSpan,
  dayText,
  defaultFormat,
  durationText,
  formatsOf,
  monthText,
} from '../../src/replay/formats.ts';

const at = (year: number, month: number, day: number, hour = 9, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).getTime();

describe('time formats', () => {
  const long = 54 * 3600 + 38 * 60 + 25;
  it('writes a time as h:mm:ss, h:mm, hours or days', () => {
    expect(durationText(long, 'hms')).toBe('54:38:25');
    expect(durationText(long, 'hm')).toBe('54:38');
    expect(durationText(long, 'h')).toBe('55 h');
    expect(durationText(long, 'd')).toBe('2.3 days');
    // Hours have a tenth under ten; one day is a day.
    expect(durationText(100 * 60, 'h')).toBe('1.7 h');
    expect(durationText(86_400, 'd')).toBe('1.0 day');
    expect(durationText(0, 'hms')).toBe('0:00:00');
  });

  it('are offered for the times, with the usual one over the replay and on the card', () => {
    expect(formatsOf('moving')).toEqual(['hms', 'hm', 'h', 'd']);
    expect(formatsOf('max-time')).toEqual(['hms', 'hm', 'h', 'd']);
    expect(formatsOf('distance')).toEqual([]);
    expect(defaultFormat('time')).toBe('hms');
    expect(defaultFormat('time', true)).toBe('h');
    expect(defaultFormat('date')).toBe('dmy');
    expect(defaultFormat('start')).toBe('24h');
    expect(defaultFormat('climb')).toBeNull();
  });
});

describe('date formats', () => {
  it('writes a day in each format', () => {
    const day = at(2026, 5, 8);
    expect(dayText(day, 'dmy')).toBe('8 May 2026');
    expect(dayText(day, 'dm')).toBe('8 May');
    expect(dayText(day, 'wdm')).toBe('Fri 8 May');
    expect(dayText(day, 'mdy')).toBe('May 8, 2026');
    expect(dayText(day, 'iso')).toBe('2026-05-08');
  });

  it('writes the days between two as short as reads well', () => {
    const [a, b] = [at(2026, 8, 3), at(2026, 8, 9)];
    expect(dateSpan(a, b, 'dmy')).toBe('3–9 Aug 2026');
    expect(dateSpan(a, b, 'dm')).toBe('3–9 Aug');
    expect(dateSpan(a, b, 'mdy')).toBe('Aug 3–9, 2026');
    expect(dateSpan(a, b, 'wdm')).toBe('Mon 3 Aug – Sun 9 Aug');
    expect(dateSpan(at(2026, 4, 2), at(2026, 5, 8), 'dmy')).toBe('2 Apr – 8 May 2026');
    expect(dateSpan(at(2026, 4, 2), at(2026, 5, 8), 'mdy')).toBe('Apr 2 – May 8, 2026');
    expect(dateSpan(at(2025, 12, 28), at(2026, 1, 3), 'dmy')).toBe('28 Dec 2025 – 3 Jan 2026');
    expect(dateSpan(at(2025, 12, 28), at(2026, 1, 3), 'mdy')).toBe('Dec 28, 2025 – Jan 3, 2026');
    expect(dateSpan(a, b, 'iso')).toBe('2026-08-03 – 2026-08-09');
    // The same day twice is that day.
    expect(dateSpan(a, at(2026, 8, 3, 18), 'dm')).toBe('3 Aug');
  });

  it('writes a month with its year, or without where the format leaves it out', () => {
    const may = at(2026, 5, 8);
    expect(monthText(may, 'dmy')).toBe('May 2026');
    expect(monthText(may, 'mdy')).toBe('May 2026');
    expect(monthText(may, 'dm')).toBe('May');
    expect(monthText(may, 'wdm')).toBe('May');
    expect(monthText(may, 'iso')).toBe('2026-05');
  });
});

describe('clock formats', () => {
  it('writes a time of day in 24 or 12 hours', () => {
    expect(clockTimeText(at(2026, 5, 8, 6, 42), '24h')).toBe('06:42');
    expect(clockTimeText(at(2026, 5, 8, 6, 42), '12h')).toBe('6:42 AM');
    expect(clockTimeText(at(2026, 5, 8, 0, 5), '12h')).toBe('12:05 AM');
    expect(clockTimeText(at(2026, 5, 8, 12, 30), '12h')).toBe('12:30 PM');
    expect(clockTimeText(at(2026, 5, 8, 18, 0), '12h')).toBe('6:00 PM');
  });
});
