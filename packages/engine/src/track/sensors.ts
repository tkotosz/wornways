// Sensor values travel with the points: whatever drops, cuts or reorders points does the
// same to every sensor channel, through these helpers.

import { SENSOR_CHANNELS, type SensorChannel, type Sensors } from './types.ts';

/** Each channel with one array per point built by `make` from the channel's values. */
function mapChannels(
  sensors: Sensors | undefined,
  make: (values: Float32Array) => Float32Array,
): Sensors | undefined {
  if (!sensors) return undefined;
  const out: Sensors = {};
  for (const channel of SENSOR_CHANNELS) {
    const values = sensors[channel];
    if (values) out[channel] = make(values);
  }
  return out;
}

/** The values at the points `indices` names, in that order. */
export function pickSensors(sensors: Sensors | undefined, indices: number[]): Sensors | undefined {
  return mapChannels(sensors, (values) => Float32Array.from(indices, (i) => values[i]));
}

/** The values of points `from` up to, not including, `to`. */
export function sliceSensors(
  sensors: Sensors | undefined,
  from: number,
  to: number,
): Sensors | undefined {
  return mapChannels(sensors, (values) => values.slice(from, to));
}

/**
 * The value at a fractional point index: between two values in proportion, the one that
 * exists when the other is missing (NaN).
 */
export function sensorAt(values: Float32Array, index: number): number {
  const i = Math.min(Math.floor(index), values.length - 1);
  const f = index - i;
  const a = values[i];
  const b = values[Math.min(i + 1, values.length - 1)];
  if (Number.isNaN(a)) return b;
  if (Number.isNaN(b) || f === 0) return a;
  return a + f * (b - a);
}

/**
 * The values of a section of points: a cut at fractional index `from`, the whole points
 * `first` up to, not including, `past`, and a cut at fractional index `to`.
 */
export function cutSensors(
  sensors: Sensors | undefined,
  from: number,
  first: number,
  past: number,
  to: number,
): Sensors | undefined {
  return mapChannels(sensors, (values) => {
    const out = new Float32Array(past - first + 2);
    out[0] = sensorAt(values, from);
    out.set(values.subarray(first, past), 1);
    out[out.length - 1] = sensorAt(values, to);
    return out;
  });
}

/** Whether the channel has at least one value. */
export function recorded(sensors: Sensors | undefined, channel: SensorChannel): boolean {
  const values = sensors?.[channel];
  return !!values && values.some((value) => !Number.isNaN(value));
}

/**
 * Sensor arrays from per-point rows: `rows[i]` holds each channel's value at point i, NaN
 * where missing. Channels with no value at any point are left out; undefined when none has
 * one.
 */
export function sensorsFrom(rows: Record<SensorChannel, number>[]): Sensors | undefined {
  const out: Sensors = {};
  for (const channel of SENSOR_CHANNELS) {
    if (!rows.some((row) => !Number.isNaN(row[channel]))) continue;
    out[channel] = Float32Array.from(rows, (row) => row[channel]);
  }
  return Object.keys(out).length ? out : undefined;
}
