// Pace and speed in words, for the metrics card over the video and the totals card.

import { distanceUnit, inDistanceUnits, type Units } from './formats.ts';

/** Sports whose speed is told as minutes per kilometer (or mile). */
export const isOnFoot = (sport: string) => /run|walk|hike/.test(sport);

/** A speed's unit: on foot minutes per kilometer or mile, otherwise km/h or mph. */
export type SpeedUnit = '/km' | '/mi' | 'km/h' | 'mph';

/**
 * The average over `metres` covered in `seconds`: minutes per kilometer or mile on foot
 * ("5:32" and "/km"), otherwise kilometers or miles per hour ("24.3" and "km/h"). Under 20 m
 * or 0 s there is no average yet: "–:––" or "0.0".
 */
export function averagePace(
  onFoot: boolean,
  seconds: number,
  metres: number,
  units: Units,
): { value: string; unit: SpeedUnit } {
  const moving = seconds > 0 && metres >= 20;
  const distance = inDistanceUnits(metres, units);
  if (!onFoot)
    return {
      value: moving ? (distance / (seconds / 3600)).toFixed(1) : '0.0',
      unit: units === 'metric' ? 'km/h' : 'mph',
    };
  const unit = `/${distanceUnit(units)}` as const;
  if (!moving) return { value: '–:––', unit };
  const perUnit = Math.round(seconds / distance);
  return { value: `${Math.floor(perUnit / 60)}:${String(perUnit % 60).padStart(2, '0')}`, unit };
}

/**
 * A top speed of `metersPerSecond`: on foot as the pace it means ("3:10" and "/km"),
 * otherwise in kilometers or miles per hour ("54.2" and "km/h").
 */
export function topSpeed(
  onFoot: boolean,
  metersPerSecond: number,
  units: Units,
): { value: string; unit: SpeedUnit } {
  // The average over an hour at that speed.
  return averagePace(onFoot, 3600, metersPerSecond * 3600, units);
}
