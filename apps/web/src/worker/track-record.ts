// A downloaded track as the Strava and Ride with GPS caches store it, in one Float64Array:
//
//   [start time, ...points]                                   without sensor values
//   [start time, NaN, channels, ...points, ...sensor values]  with them
//
// `channels` is a bit mask of SENSOR_CHANNELS; each channel present follows the points with
// one value per point, in SENSOR_CHANNELS order. The NaN tells the two apart: in the first
// layout that place holds the first point's longitude. Records stored before sensor values
// were kept have the first layout and still read.

import { SENSOR_CHANNELS, STRIDE, type Sensors, type Track } from '@wornways/engine';

export type TrackRecord = Pick<Track, 'startTime' | 'points' | 'sensors'>;

export function encodeTrack(track: TrackRecord): Float64Array<ArrayBuffer> {
  const channels = SENSOR_CHANNELS.filter((channel) => track.sensors?.[channel]);
  if (channels.length === 0) {
    const record = new Float64Array(track.points.length + 1);
    record[0] = track.startTime;
    record.set(track.points, 1);
    return record;
  }
  const n = track.points.length / STRIDE;
  const record = new Float64Array(3 + track.points.length + channels.length * n);
  record[0] = track.startTime;
  record[1] = NaN;
  record[2] = channels.reduce((mask, channel) => mask | (1 << SENSOR_CHANNELS.indexOf(channel)), 0);
  record.set(track.points, 3);
  channels.forEach((channel, k) =>
    record.set(track.sensors![channel]!, 3 + track.points.length + k * n),
  );
  return record;
}

/** The track a record holds; undefined when the record is damaged. */
export function decodeTrack(record: Float64Array): TrackRecord | undefined {
  const startTime = record[0]!;
  if (!Number.isFinite(startTime)) return;
  if (!Number.isNaN(record[1])) {
    const points = record.subarray(1);
    if (points.length < 2 * STRIDE || points.length % STRIDE) return;
    return { startTime, points };
  }
  const mask = record[2]!;
  const channels = SENSOR_CHANNELS.filter((_, bit) => mask & (1 << bit));
  const size = record.length - 3;
  const n = size / (STRIDE + channels.length);
  if (!channels.length || !Number.isInteger(n) || n < 2) return;
  const points = record.subarray(3, 3 + n * STRIDE);
  const sensors: Sensors = {};
  channels.forEach((channel, k) => {
    const from = 3 + n * STRIDE + k * n;
    sensors[channel] = Float32Array.from(record.subarray(from, from + n));
  });
  return { startTime, points, sensors };
}
