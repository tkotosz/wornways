// What the person chose in the Choose step, and the settings it stands for.

import { parseDistanceKm, parseSettings, type SettingsInput } from '@wornways/engine';

export type Period =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'this-month'
  | 'last-month'
  | 'this-year'
  | 'last-year'
  | 'custom';

export const PERIODS: { id: Period; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'this-year', label: 'This year' },
  { id: 'last-year', label: 'Last year' },
  { id: 'custom', label: 'Custom' },
];

/** One place filter: whether it is on, its place and how close counts as near. */
export type NearChoice = {
  on: boolean;
  /** The place as "latitude,longitude"; empty while not set. The filter waits for it. */
  place: string;
  /** How close to the place, in meters, counts as near. */
  radius: number;
};

export type Choice = {
  /**
   * The period; null until the person picks one, so that which activities the video shows
   * is always a choice made, not a default.
   */
  period: Period | null;
  /** The custom period's first and last day, YYYY-MM-DD; empty when not set. */
  customFrom: string;
  customTo: string;
  /** The sports picked; null is "All". Never empty: unpicking the last sport goes back to "All". */
  sports: string[] | null;
  /** Distance bounds in kilometers; an empty field leaves that side open. */
  minDistanceKm: string;
  maxDistanceKm: string;
  /** Keep only activities that start near a place. */
  startNear: NearChoice;
  /** Keep only activities that end near a place. */
  endNear: NearChoice;
  /** Activities the person unticked; they stay unticked when the filters change. */
  excluded: string[];
};

export const NO_CHOICE: Choice = {
  period: null,
  customFrom: '',
  customTo: '',
  sports: null,
  minDistanceKm: '',
  maxDistanceKm: '',
  startNear: { on: false, place: '', radius: 1000 },
  endNear: { on: false, place: '', radius: 1000 },
  excluded: [],
};

const day = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const month = (year: number, monthIndex: number) => {
  const d = new Date(year, monthIndex, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** The period's start and end as the settings take them; undefined: open on that side. */
export function periodBounds(choice: Choice, today: Date): { from?: string; to?: string } {
  const year = today.getFullYear();
  switch (choice.period) {
    case null:
    case 'all':
      return {};
    case 'today':
      return { from: day(today), to: day(today) };
    case 'yesterday': {
      const yesterday = new Date(year, today.getMonth(), today.getDate() - 1);
      return { from: day(yesterday), to: day(yesterday) };
    }
    case 'this-month':
      return { from: month(year, today.getMonth()), to: month(year, today.getMonth()) };
    case 'last-month':
      return { from: month(year, today.getMonth() - 1), to: month(year, today.getMonth() - 1) };
    case 'this-year':
      return { from: String(year), to: String(year) };
    case 'last-year':
      return { from: String(year - 1), to: String(year - 1) };
    case 'custom':
      return { from: choice.customFrom || undefined, to: choice.customTo || undefined };
  }
}

/**
 * The period as moments, read the same way the video reads it: from (inclusive) and to
 * (exclusive), epoch milliseconds, null where open. Null when the period cannot be read,
 * such as an end before the start.
 */
export function periodRange(
  choice: Choice,
  today: Date,
): { from: number | null; to: number | null } | null {
  try {
    const { from, to } = parseSettings(periodBounds(choice, today));
    return { from, to };
  } catch {
    return null;
  }
}

/** Whether the person picked this sport; with "All" no single sport is picked. */
export const sportPicked = (choice: Choice, sport: string) =>
  choice.sports?.includes(sport) ?? false;

/** The picked sports after the sport is clicked; null ("All") when none is left. */
export function toggledSports(choice: Choice, sport: string): string[] | null {
  const picked = choice.sports ?? [];
  const next = picked.includes(sport) ? picked.filter((s) => s !== sport) : [...picked, sport];
  return next.length > 0 ? next : null;
}

/** Whether a place filter is on but its place is not set yet; the filters wait for it. */
export const placeMissing = (choice: Choice) =>
  [choice.startNear, choice.endNear].some((near) => near.on && !near.place);

export function distanceBound(text: string, open: number): number {
  const value = text.trim();
  if (!value) return open;
  return parseDistanceKm(value);
}

export function distanceRange(choice: Choice): { min: number; max: number } | null {
  const min = distanceBound(choice.minDistanceKm, -Infinity);
  const max = distanceBound(choice.maxDistanceKm, Infinity);
  return min <= max ? { min, max } : null;
}

/** The settings of one place filter, once it is on and its place is set. */
function nearSettings(near: NearChoice, end: 'start' | 'end'): SettingsInput {
  if (!near.on || !near.place) return {};
  return { [`${end}-near`]: near.place, [`${end}-radius`]: String(near.radius) };
}

/** The settings of the filters alone: period, sports and the place filters set so far. */
export function filterSettings(choice: Choice, today: Date): SettingsInput {
  return {
    ...periodBounds(choice, today),
    sport: choice.sports === null ? undefined : choice.sports.join(','),
    ...nearSettings(choice.startNear, 'start'),
    ...nearSettings(choice.endNear, 'end'),
  };
}

/** The settings of the period and sports alone: where to look for places to suggest. */
export function placeSettings(choice: Choice, today: Date): SettingsInput {
  const off = { on: false, place: '', radius: 0 };
  return filterSettings({ ...choice, startNear: off, endNear: off }, today);
}

/**
 * The settings of the whole file choice. Include the ticked IDs when activities were unticked.
 */
export function choiceSettings(choice: Choice, matched: string[], today: Date): SettingsInput {
  const settings = filterSettings(choice, today);
  const excluded = new Set(choice.excluded);
  const ticked = matched.filter((id) => !excluded.has(id));
  if (ticked.length < matched.length) settings.activity = ticked;
  if (choice.minDistanceKm.trim()) settings['min-distance'] = choice.minDistanceKm;
  if (choice.maxDistanceKm.trim()) settings['max-distance'] = choice.maxDistanceKm;
  return settings;
}
