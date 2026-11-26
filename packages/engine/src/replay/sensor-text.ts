import type { SensorChannel } from '../track/types.ts';

/** A sensor value's number with its unit: cadence doubled into steps on foot. */
export function sensorValueText(channel: SensorChannel, value: number, onFoot: boolean): string {
  const whole = Math.round(value);
  if (channel === 'heartRate') return `${whole} bpm`;
  if (channel === 'power') return `${whole} W`;
  if (channel === 'cadence') return onFoot ? `${Math.round(value * 2)} spm` : `${whole} rpm`;
  return `${whole} °C`;
}
