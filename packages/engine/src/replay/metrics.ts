// The values a widget can show, as the overlay and the totals card share them.

import type { ValueFormat } from './formats.ts';

/**
 * A value a widget can show, by what it measures. For several activities, the plain ones are
 * totals ("Total distance"); avg-, max- and min-time, -distance, -climb and -calories are
 * per activity ("Avg distance per activity"); the others are over every activity together.
 * - time: the time so far, stops included (a race: its clock); moving: the time moving;
 *   start: when one activity started; time-of-day: the clock time as one activity plays
 * - distance
 * - avg-speed: the average while moving (pace on foot); max-speed: the fastest over 10 s;
 *   speed-now: over the last 10 s, as one activity plays
 * - climb, descent: meters climbed and descended; max- and min-elevation: the highest and
 *   lowest point; elevation-now: as one activity plays
 * - heart rate, power, cadence and temperature: their average over time, highest, lowest
 *   (heart rate and temperature) and value as one activity plays
 * - calories; count: how many activities (a race: how many still out); days: the calendar
 *   days from the first activity's to the last one's; moving-days: the days with an activity;
 *   date
 */
export type Metric =
  | 'time'
  | 'moving'
  | 'avg-time'
  | 'max-time'
  | 'min-time'
  | 'start'
  | 'time-of-day'
  | 'distance'
  | 'avg-distance'
  | 'max-distance'
  | 'min-distance'
  | 'avg-speed'
  | 'max-speed'
  | 'speed-now'
  | 'climb'
  | 'descent'
  | 'avg-climb'
  | 'max-climb'
  | 'min-climb'
  | 'max-elevation'
  | 'min-elevation'
  | 'elevation-now'
  | 'avg-heart-rate'
  | 'max-heart-rate'
  | 'min-heart-rate'
  | 'heart-rate-now'
  | 'avg-power'
  | 'max-power'
  | 'power-now'
  | 'avg-cadence'
  | 'max-cadence'
  | 'cadence-now'
  | 'avg-temperature'
  | 'min-temperature'
  | 'max-temperature'
  | 'temperature-now'
  | 'calories'
  | 'avg-calories'
  | 'max-calories'
  | 'min-calories'
  | 'count'
  | 'days'
  | 'moving-days'
  | 'date';
export const METRICS: readonly Metric[] = [
  'time',
  'moving',
  'avg-time',
  'max-time',
  'min-time',
  'start',
  'time-of-day',
  'distance',
  'avg-distance',
  'max-distance',
  'min-distance',
  'avg-speed',
  'max-speed',
  'speed-now',
  'climb',
  'descent',
  'avg-climb',
  'max-climb',
  'min-climb',
  'max-elevation',
  'min-elevation',
  'elevation-now',
  'avg-heart-rate',
  'max-heart-rate',
  'min-heart-rate',
  'heart-rate-now',
  'avg-power',
  'max-power',
  'power-now',
  'avg-cadence',
  'max-cadence',
  'cadence-now',
  'avg-temperature',
  'min-temperature',
  'max-temperature',
  'temperature-now',
  'calories',
  'avg-calories',
  'max-calories',
  'min-calories',
  'count',
  'days',
  'moving-days',
  'date',
];
/** The values that make sense only while one activity plays. */
export const SINGLE_ONLY = [
  'start',
  'time-of-day',
  'speed-now',
  'elevation-now',
  'heart-rate-now',
  'power-now',
  'cadence-now',
  'temperature-now',
] as const satisfies readonly Metric[];

/** A value's text: its number with the unit, and its words. */
export type MetricText = { value: string; label: string };

/**
 * A value as a widget shows it: its text in the usual format, its name for this video ("Total
 * distance", "Race time"), and for a time, date or clock time its text in every format
 * (`formats`, see formats.ts).
 */
export type MetricValue = MetricText & {
  name: string;
  formats?: Partial<Record<ValueFormat, MetricText>>;
};
