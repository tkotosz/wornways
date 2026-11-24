// A Strava activity's streams turned into a track: positions, times and elevations, and the
// heart rate, cadence, power and temperature recorded with them.

import { sensorsFrom, STRIDE, type LatLon, type SensorChannel, type Track } from '@wornways/engine';
import type { ActivitySummary } from '../messages.ts';

export type Streams = {
  latlng?: { data: [number, number][] };
  time?: { data: number[] };
  altitude?: { data: number[] };
  heartrate?: { data: number[] };
  cadence?: { data: number[] };
  watts?: { data: number[] };
  temp?: { data: number[] };
};

/** A [lat, lon] pair as a position; undefined when it is not one. */
export function coordinates(values: number[] | null | undefined): LatLon | undefined {
  if (values?.length !== 2) return;
  const [lat, lon] = values;
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat!) <= 90 && Math.abs(lon!) <= 180)
    return { lat: lat!, lon: lon! };
}

/** A track from an activity's streams; null when they hold fewer than two timed positions. */
export function trackFromStreams(activity: ActivitySummary, streams: Streams): Track | null {
  const positions = streams.latlng?.data;
  const times = streams.time?.data;
  const elevations = streams.altitude?.data;
  if (!positions || !times || positions.length !== times.length) return null;
  const points = new Float64Array(positions.length * STRIDE);
  const readings: Record<SensorChannel, number>[] = [];
  const valueAt = (stream: { data: number[] } | undefined, index: number) =>
    Number.isFinite(stream?.data[index]) ? stream!.data[index]! : NaN;
  let size = 0;
  for (const [index, coordinate] of positions.entries()) {
    const point = coordinates(coordinate);
    if (!point || !Number.isFinite(times[index])) continue;
    const { lat, lon } = point;
    points[size++] = lon;
    points[size++] = lat;
    points[size++] = Number.isFinite(elevations?.[index]) ? elevations![index]! : NaN;
    points[size++] = times[index]!;
    readings.push({
      heartRate: valueAt(streams.heartrate, index),
      cadence: valueAt(streams.cadence, index),
      power: valueAt(streams.watts, index),
      temperature: valueAt(streams.temp, index),
    });
  }
  if (size < 2 * STRIDE) return null;
  const offset = points[3]!;
  for (let i = 3; i < size; i += STRIDE) points[i] = points[i]! - offset;
  const sensors = sensorsFrom(readings);
  return {
    ...activity,
    points: points.subarray(0, size),
    ...(sensors ? { sensors } : {}),
  };
}
