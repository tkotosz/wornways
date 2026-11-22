// How the page writes dates, distances, sports and counts.

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** "Sat 2 May 2026". */
export const dayText = (ms: number) => dayFormat.format(ms);

const shortDayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: '2-digit',
});

const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

/** "14:35". */
export const timeText = (ms: number) => timeFormat.format(ms);

/** "2 May 26", for narrow screens. */
export const shortDayText = (ms: number) => shortDayFormat.format(ms);

/** "12.3 km" under 100 km, "1,234 km" above. */
export function kmText(meters: number): string {
  const km = meters / 1000;
  return km < 100 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString('en-US')} km`;
}

/** A short distance: "500 m" under a kilometer, "1.5 km" or "20 km" above. */
export function distanceText(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${Number((meters / 1000).toFixed(1))} km`;
}

/** "trail-run" becomes "Trail run". */
export function sportText(slug: string): string {
  const words = slug.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "1 activity", "3 activities". */
export const countText = (n: number, one: string, many: string) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
