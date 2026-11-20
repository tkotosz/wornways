const RAD = Math.PI / 180;

/** Metres per degree of latitude and of longitude at the given latitude. */
export function metresPerDegree(lat: number): { perLat: number; perLon: number } {
  return { perLat: 110540, perLon: 111320 * Math.cos(lat * RAD) };
}

/** The signed longitude step along the shorter arc, including across the date line. */
export function longitudeDelta(from: number, to: number): number {
  const delta = (to - from) % 360;
  return delta > 180 ? delta - 360 : delta < -180 ? delta + 360 : delta;
}

/** Flat-earth distance in metres; accurate enough over the few kilometres it is used for. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const { perLat, perLon } = metresPerDegree((lat1 + lat2) / 2);
  return Math.hypot((lat2 - lat1) * perLat, longitudeDelta(lon1, lon2) * perLon);
}

/** Web Mercator, normalised so the whole world spans 0..1 on both axes. */
export function mercatorX(lon: number): number {
  return (lon + 180) / 360;
}

export function mercatorY(lat: number): number {
  const s = Math.sin(lat * RAD);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}
