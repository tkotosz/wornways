// How a time, a date or a clock time is written, as a widget picks it, and in which units the
// distances, heights, speeds and temperatures are told.

import type { Metric } from './metrics.ts';

/** A length of time: 54:38:25, 54:38, whole hours (55 h) or days (2.3 days). */
export type TimeFormat = 'hms' | 'hm' | 'h' | 'd';
export const TIME_FORMATS: readonly TimeFormat[] = ['hms', 'hm', 'h', 'd'];

/** A day: 8 May 2026, 8 May, Fri 8 May, May 8, 2026, or 2026-05-08. */
export type DateFormat = 'dmy' | 'dm' | 'wdm' | 'mdy' | 'iso';
export const DATE_FORMATS: readonly DateFormat[] = ['dmy', 'dm', 'wdm', 'mdy', 'iso'];

/** A time of day: 06:42 or 6:42 AM. */
export type ClockFormat = '24h' | '12h';
export const CLOCK_FORMATS: readonly ClockFormat[] = ['24h', '12h'];

export type ValueFormat = TimeFormat | DateFormat | ClockFormat;

/** Kilometers and meters, or miles and feet; the temperature in °C or °F. */
export type Units = 'metric' | 'imperial';
export const UNITS: readonly Units[] = ['metric', 'imperial'];

const TIME_METRICS: readonly Metric[] = ['time', 'moving', 'avg-time', 'max-time', 'min-time'];

/** The formats a value can be written in: none for one that is not a time, date or clock. */
export function formatsOf(metric: Metric): readonly ValueFormat[] {
  if (TIME_METRICS.includes(metric)) return TIME_FORMATS;
  if (metric === 'date') return DATE_FORMATS;
  if (metric === 'start' || metric === 'time-of-day') return CLOCK_FORMATS;
  return [];
}

/**
 * The format a value is written in unless one is picked: times as 54:38:25 over the replay
 * and in hours on the totals card, dates as 8 May 2026, clock times as 06:42. Null for a
 * value with no formats.
 */
export function defaultFormat(metric: Metric, card = false): ValueFormat | null {
  const formats = formatsOf(metric);
  if (formats === TIME_FORMATS) return card ? 'h' : 'hms';
  return formats[0] ?? null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const wholeNumber = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * `seconds` as a number and its unit: "54:38:25" and "54:38" have none; hours are whole from
 * 10 on and have a tenth below ("1.7", "h"); days have a tenth ("2.3", "days").
 */
export function durationParts(
  seconds: number,
  format: TimeFormat,
): { value: string; unit: '' | 'h' | 'day' | 'days' } {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (format === 'hms') return { value: `${hours}:${pad(minutes)}:${pad(s % 60)}`, unit: '' };
  if (format === 'hm') return { value: `${hours}:${pad(minutes)}`, unit: '' };
  if (format === 'h') {
    const h = seconds / 3600;
    return { value: h < 10 ? h.toFixed(1) : wholeNumber(h), unit: 'h' };
  }
  const days = (seconds / 86_400).toFixed(1);
  return { value: days, unit: days === '1.0' ? 'day' : 'days' };
}

/** `seconds` written out: "54:38:25", "54:38", "55 h", "2.3 days". */
export function durationText(seconds: number, format: TimeFormat): string {
  const { value, unit } = durationParts(seconds, format);
  return unit ? `${value} ${unit}` : value;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** One day in local time, with its year or without. */
function day(d: Date, format: DateFormat, year: boolean): string {
  const [date, month, y] = [d.getDate(), MONTHS[d.getMonth()]!, d.getFullYear()];
  switch (format) {
    case 'dmy':
      return year ? `${date} ${month} ${y}` : `${date} ${month}`;
    case 'dm':
      return `${date} ${month}`;
    case 'wdm':
      return `${WEEKDAYS[d.getDay()]} ${date} ${month}`;
    case 'mdy':
      return year ? `${month} ${date}, ${y}` : `${month} ${date}`;
    case 'iso':
      return `${y}-${pad(d.getMonth() + 1)}-${pad(date)}`;
  }
}

/** The day `time` falls on, in local time: "8 May 2026", "Fri 8 May", "2026-05-08". */
export function dayText(time: number, format: DateFormat): string {
  return day(new Date(time), format, true);
}

/**
 * The days from `a` to `b`, in local time, as short as reads well: "3–9 Aug 2026", "28 Jul –
 * 3 Aug 2026", "28 Dec 2025 – 3 Jan 2026"; "Aug 3–9, 2026"; "Mon 3 Aug – Sun 9 Aug"; one day
 * alone when they fall on the same one.
 */
export function dateSpan(a: number, b: number, format: DateFormat): string {
  const [da, db] = [new Date(a), new Date(b)];
  const sameYear = da.getFullYear() === db.getFullYear();
  const sameMonth = sameYear && da.getMonth() === db.getMonth();
  if (sameMonth && da.getDate() === db.getDate()) return dayText(a, format);
  const month = (d: Date) => MONTHS[d.getMonth()];
  switch (format) {
    case 'dmy':
      if (!sameYear) return `${day(da, format, true)} – ${day(db, format, true)}`;
      if (!sameMonth) return `${day(da, format, false)} – ${day(db, format, true)}`;
      return `${da.getDate()}–${db.getDate()} ${month(db)} ${db.getFullYear()}`;
    case 'dm':
      return sameMonth
        ? `${da.getDate()}–${db.getDate()} ${month(db)}`
        : `${day(da, format, false)} – ${day(db, format, false)}`;
    case 'mdy':
      if (!sameYear) return `${day(da, format, true)} – ${day(db, format, true)}`;
      if (!sameMonth) return `${day(da, format, false)} – ${day(db, format, true)}`;
      return `${month(db)} ${da.getDate()}–${db.getDate()}, ${db.getFullYear()}`;
    case 'wdm':
    case 'iso':
      return `${day(da, format, true)} – ${day(db, format, true)}`;
  }
}

/** The month `time` falls in: "May 2026", or "May" when the format leaves out the year. */
export function monthText(time: number, format: DateFormat): string {
  const d = new Date(time);
  if (format === 'iso') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const month = LONG_MONTHS[d.getMonth()]!;
  return format === 'dm' || format === 'wdm' ? month : `${month} ${d.getFullYear()}`;
}

/** The time of day of `time`, in local time: "06:42" or "6:42 AM". */
export function clockTimeText(time: number, format: ClockFormat): string {
  const d = new Date(time);
  const [hours, minutes] = [d.getHours(), pad(d.getMinutes())];
  if (format === '24h') return `${pad(hours)}:${minutes}`;
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
}

const METERS_PER_MILE = 1609.344;
const METERS_PER_FOOT = 0.3048;

/** A distance's unit: "km" or "mi". */
export const distanceUnit = (units: Units) => (units === 'metric' ? 'km' : 'mi');
/** `meters` in kilometers or miles. */
export const inDistanceUnits = (meters: number, units: Units) =>
  meters / (units === 'metric' ? 1000 : METERS_PER_MILE);

/** A height's unit: "m" or "ft". */
export const heightUnit = (units: Units) => (units === 'metric' ? 'm' : 'ft');
/** `meters` of height in meters or feet. */
export const inHeightUnits = (meters: number, units: Units) =>
  units === 'metric' ? meters : meters / METERS_PER_FOOT;

/** `celsius` in degrees Celsius or Fahrenheit, and its unit. */
export const inTemperatureUnits = (celsius: number, units: Units) =>
  units === 'metric'
    ? { value: celsius, unit: '°C' }
    : { value: (celsius * 9) / 5 + 32, unit: '°F' };
