// Pace and speed in words, for the metrics card over the video and the totals card.

/** Sports whose speed is told as minutes per kilometer. */
export const isOnFoot = (sport: string) => /run|walk|hike/.test(sport);

/**
 * The average over `metres` covered in `seconds`: minutes per kilometer on foot ("5:32" and
 * "/km"), otherwise kilometers per hour ("24.3" and "km/h"). Under 20 m or 0 s there is no
 * average yet: "–:––" or "0.0".
 */
export function averagePace(
  onFoot: boolean,
  seconds: number,
  metres: number,
): { value: string; unit: '/km' | 'km/h' } {
  const moving = seconds > 0 && metres >= 20;
  if (!onFoot)
    return { value: moving ? (metres / 1000 / (seconds / 3600)).toFixed(1) : '0.0', unit: 'km/h' };
  if (!moving) return { value: '–:––', unit: '/km' };
  const perKm = Math.round(seconds / (metres / 1000));
  return {
    value: `${Math.floor(perKm / 60)}:${String(perKm % 60).padStart(2, '0')}`,
    unit: '/km',
  };
}

/**
 * A top speed of `metersPerSecond`: on foot as the pace it means ("3:10" and "/km"),
 * otherwise in kilometers per hour ("54.2" and "km/h").
 */
export function topSpeed(
  onFoot: boolean,
  metersPerSecond: number,
): { value: string; unit: '/km' | 'km/h' } {
  // The average over an hour at that speed.
  return averagePace(onFoot, 3600, metersPerSecond * 3600);
}
