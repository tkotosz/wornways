const RAD = Math.PI / 180;

/** Metres per degree of latitude and of longitude at the given latitude. */
export function metresPerDegree(lat: number): { perLat: number; perLon: number } {
  return { perLat: 110540, perLon: 111320 * Math.cos(lat * RAD) };
}

/** Flat-earth distance in metres; accurate enough over the few kilometres it is used for. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const { perLat, perLon } = metresPerDegree((lat1 + lat2) / 2);
  return Math.hypot((lat2 - lat1) * perLat, (lon2 - lon1) * perLon);
}

/** Web Mercator, normalised so the whole world spans 0..1 on both axes. */
export function mercatorX(lon: number): number {
  return (lon + 180) / 360;
}

export function mercatorY(lat: number): number {
  const s = Math.sin(lat * RAD);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}
