import type { SensorChannel } from '../track/types.ts';
import { inTemperatureUnits, type Units } from './formats.ts';

/**
 * A sensor value's number with its unit: cadence doubled into steps on foot, the temperature
 * in °C or °F.
 */
export function sensorValueText(
  channel: SensorChannel,
  value: number,
  onFoot: boolean,
  units: Units,
): string {
  const whole = Math.round(value);
  if (channel === 'heartRate') return `${whole} bpm`;
  if (channel === 'power') return `${whole} W`;
  if (channel === 'cadence') return onFoot ? `${Math.round(value * 2)} spm` : `${whole} rpm`;
  const temperature = inTemperatureUnits(value, units);
  return `${Math.round(temperature.value)} ${temperature.unit}`;
}
