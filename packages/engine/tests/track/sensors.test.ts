import { describe, expect, it } from 'vitest';
import {
  cutSensors,
  pickSensors,
  recorded,
  sensorAt,
  sensorsFrom,
  sliceSensors,
} from '../../src/track/sensors.ts';

const heartRate = Float32Array.from([100, 110, NaN, 130, 140]);

describe('sensor values', () => {
  it('follow the points picked, sliced or cut', () => {
    expect(Array.from(pickSensors({ heartRate }, [0, 3, 4])!.heartRate!)).toEqual([100, 130, 140]);
    expect(Array.from(sliceSensors({ heartRate }, 1, 4)!.heartRate!)).toEqual([110, NaN, 130]);
    // A cut a quarter past point 0 and one half past point 3.
    expect(Array.from(cutSensors({ heartRate }, 0.25, 1, 4, 3.5)!.heartRate!)).toEqual([
      102.5,
      110,
      NaN,
      130,
      135,
    ]);
    expect(pickSensors(undefined, [0])).toBeUndefined();
  });

  it('take the value that exists when a cut falls next to a missing one', () => {
    expect(sensorAt(heartRate, 1.5)).toBe(110);
    expect(sensorAt(heartRate, 2.5)).toBe(130);
    expect(sensorAt(heartRate, 4)).toBe(140);
  });

  it('are built from rows, leaving out channels without any value', () => {
    const sensors = sensorsFrom([
      { heartRate: 120, power: NaN, cadence: 80, temperature: NaN, speed: NaN },
      { heartRate: 125, power: NaN, cadence: NaN, temperature: NaN, speed: NaN },
    ])!;
    expect(Object.keys(sensors).sort()).toEqual(['cadence', 'heartRate']);
    expect(Array.from(sensors.cadence!)).toEqual([80, NaN]);
    expect(recorded(sensors, 'heartRate')).toBe(true);
    expect(recorded(sensors, 'power')).toBe(false);
    expect(
      sensorsFrom([{ heartRate: NaN, power: NaN, cadence: NaN, temperature: NaN, speed: NaN }]),
    ).toBeUndefined();
  });
});
