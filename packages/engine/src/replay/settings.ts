// The settings of a replay video.
//
// `SETTINGS` describes every setting once: its name, the values it takes and its default.
// Front ends build their flags or controls from that table and
// turn what the user entered into `RenderSettings` with `parseSettings`.

import { sportSlug } from '../import/index-csv.ts';
import type { LatLon } from '../track/places.ts';
import { END_CARD_S } from './end-card.ts';
import { TOTALS_CARD_S, TOTALS_FIELDS } from './totals-card.ts';
import { PRESETS, PRESET_NAMES, type Preset } from './presets.ts';
import type { Grouping } from './plans.ts';
import { METRICS, SINGLE_ONLY } from './metrics.ts';
import type { Units } from './formats.ts';
import { LAYOUTS, LAYOUT_NAMES, type LayoutName } from './layouts.ts';
import { parseWidgets, type Widget } from './widgets.ts';

export type RenderSettings = {
  // Which activities
  /** First moment included, epoch milliseconds; null: from the first activity. */
  from: number | null;
  /** First moment no longer included, epoch milliseconds; null: up to the last activity. */
  to: number | null;
  /** Only the activities with these ids; null: every activity the other filters keep. */
  activities: string[] | null;
  /** Sport slugs to include; null: every sport. */
  sports: string[] | null;
  /** Inclusive bounds on the activity's distance before cleaning, in kilometres. */
  minDistanceKm: number | null;
  maxDistanceKm: number | null;
  /** Keep only activities that start within `radius` meters of the place; null: off. */
  startNear: NearPlace | null;
  /** Keep only activities that end within `radius` meters of the place; null: off. */
  endNear: NearPlace | null;

  // Timing
  /** Video length in seconds, exact; a single activity may be shorter. */
  duration: number;
  /**
   * What one group covers: an activity, a calendar day, week or month, or every activity;
   * auto: the finest of activity, day, week and month that gives every group at least 1.5 s.
   */
  group: 'auto' | Grouping;
  /** Every group gets the same time, or time growing with its distance. */
  share: 'even' | 'distance';
  /**
   * How a group's activities move: each over the group's whole time, finishing together
   * (fit), or at their real pace on one clock, the longest filling the group (real).
   */
  groupPace: 'fit' | 'real';
  /** How much of a group's time, in percent, the next group starts early; 0: none. */
  overlap: number;
  pace: 'time' | 'distance';
  /** Seconds the finished picture stays after the replay, before any card; added to the length. */
  endPause: number;

  /** Hide routes within this many metres of their start or finish. Zero shows the full route. */
  trimRadius: number;

  // Look
  camera: 'zoom' | 'fixed' | 'follow';
  map: boolean;
  width: number;
  height: number;
  fps: number;

  // What is drawn
  /**
   * The video's title, which a text widget without its own text shows, over the replay and
   * on the totals card; null: a title made from the selection; empty: no title.
   */
  title: string | null;
  /** What is drawn over the replay; null: the widgets a video starts with. */
  widgets: Widget[] | null;

  /** Whether a video of several activities shows their totals after the replay. */
  totalsCard: boolean;
  /** What the totals card shows; null: the title and the usual totals. */
  totalsWidgets: Widget[] | null;
  /** Distances, heights, speeds and temperatures in metric or imperial units. */
  units: Units;
  /** Where the widgets start when none are set, and the guides shown while arranging them. */
  layout: LayoutName;

  // Branding
  /** Whether the video ends with the Wornways card, after the replay. */
  endCard: boolean;
  /** Whether the small Wornways mark shows by the map credit while the replay plays. */
  watermark: boolean;
};

/** A place and how close to it, in meters, counts as near. */
export type NearPlace = { place: LatLon; radius: number };

export type SettingKind =
  | { type: 'switch' }
  | { type: 'number'; min: number; max: number; unit: string }
  /** One of `choices`. */
  | { type: 'choice'; choices: readonly string[] }
  /** Free text; `valueName` names the value in help, e.g. "id". */
  | { type: 'text'; valueName: string }
  /** A comma-separated list; with `choices`, of those values only. `valueName` names an item in help. */
  | { type: 'list'; choices?: readonly string[]; valueName?: string }
  /** A day, a month or a year: YYYY-MM-DD, YYYY-MM or YYYY. */
  | { type: 'day' }
  /** A place: latitude,longitude. */
  | { type: 'position' }
  /** A frame size: WxH or the name of a preset. */
  | { type: 'size' };

export type SettingGroup = 'activities' | 'timing' | 'privacy' | 'look' | 'title' | 'brand';

export const GROUP_LABELS: Record<SettingGroup, string> = {
  activities: 'Which activities',
  timing: 'Timing',
  privacy: 'Replay privacy',
  look: 'Look',
  title: 'Title',
  brand: 'Branding',
};

export type SettingDefinition = {
  /** The key of the setting in `SettingsInput`; the CLI uses it as the flag name. */
  name: string;
  label: string;
  group: SettingGroup;
  kind: SettingKind;
  /**
   * The value used when none is given, written as a user would enter it. null: there is
   * no fixed default, see `automatic`.
   */
  default: string | boolean | null;
  /** Where `default` is null: what is used instead, in words. */
  automatic?: string;
  help: string;
};

/** Frame sizes that have a name. */
export const SIZE_PRESETS: Record<string, [width: number, height: number]> = {
  story: [1080, 1920],
  square: [1080, 1080],
  landscape: [1920, 1080],
};

export const SETTINGS: readonly SettingDefinition[] = [
  {
    name: 'from',
    label: 'Period start',
    group: 'activities',
    kind: { type: 'day' },
    default: null,
    automatic: 'the first activity',
    help: 'First day, month or year to include.',
  },
  {
    name: 'to',
    label: 'Period end',
    group: 'activities',
    kind: { type: 'day' },
    default: null,
    automatic: 'the last activity',
    help: 'Last day, month or year to include.',
  },
  {
    name: 'activity',
    label: 'Activities',
    group: 'activities',
    kind: { type: 'list', valueName: 'ids' },
    default: null,
    automatic: 'every activity the other settings keep',
    help: 'Only the activities with these ids, separated by commas.',
  },
  {
    name: 'sport',
    label: 'Sports',
    group: 'activities',
    kind: { type: 'list' },
    default: null,
    automatic: 'every sport',
    help: 'Sports to include, e.g. "ride" or "run,hike".',
  },
  {
    name: 'min-distance',
    label: 'Minimum distance',
    group: 'activities',
    kind: { type: 'text', valueName: 'km' },
    default: null,
    automatic: 'no minimum',
    help: 'Keep activities at least this many kilometres long before cleaning.',
  },
  {
    name: 'max-distance',
    label: 'Maximum distance',
    group: 'activities',
    kind: { type: 'text', valueName: 'km' },
    default: null,
    automatic: 'no maximum',
    help: 'Keep activities at most this many kilometres long before cleaning.',
  },
  {
    name: 'start-near',
    label: 'Starts near',
    group: 'activities',
    kind: { type: 'position' },
    default: null,
    automatic: 'off',
    help: 'Keep only activities that start near this place.',
  },
  {
    name: 'start-radius',
    label: 'Start radius',
    group: 'activities',
    kind: { type: 'number', min: 100, max: 20000, unit: 'm' },
    default: '1000',
    help: 'How close to the start place counts as near; only with start-near.',
  },
  {
    name: 'end-near',
    label: 'Ends near',
    group: 'activities',
    kind: { type: 'position' },
    default: null,
    automatic: 'off',
    help: 'Keep only activities that end near this place.',
  },
  {
    name: 'end-radius',
    label: 'End radius',
    group: 'activities',
    kind: { type: 'number', min: 100, max: 20000, unit: 'm' },
    default: '1000',
    help: 'How close to the end place counts as near; only with end-near.',
  },

  {
    name: 'preset',
    label: 'Preset',
    group: 'timing',
    kind: { type: 'choice', choices: PRESET_NAMES },
    default: null,
    automatic: 'none',
    help:
      'A recipe for the settings below: ' +
      PRESET_NAMES.map((name) => `${name}: ${PRESETS[name].help}`).join('. ') +
      '. Settings given with it win over its values.',
  },
  {
    name: 'duration',
    label: 'Video length',
    group: 'timing',
    kind: { type: 'number', min: 5, max: 60, unit: 's' },
    default: '30',
    help:
      'Length of the video, exact. A single activity runs 15 to 60 s depending on how ' +
      'long it was, never longer than this.',
  },
  {
    name: 'group',
    label: 'Grouping',
    group: 'timing',
    kind: { type: 'choice', choices: ['auto', 'activity', 'day', 'week', 'month', 'all'] },
    default: 'auto',
    help:
      'What plays as one group: an activity, the activities of a calendar day, week ' +
      "(Monday to Sunday) or month, or all of them. A group's activities start together; " +
      'groups follow one another with no overlap. auto: the finest of activity, day, week ' +
      'and month that gives every group at least 1.5 s.',
  },
  {
    name: 'share',
    label: 'Time share',
    group: 'timing',
    kind: { type: 'choice', choices: ['even', 'distance'] },
    default: 'even',
    help:
      'even: every group gets the same time. distance: time grows with the square root of ' +
      "a group's distance, so a long ride gets more than a short run without taking over.",
  },
  {
    name: 'group-pace',
    label: 'Group pace',
    group: 'timing',
    kind: { type: 'choice', choices: ['fit', 'real'] },
    default: 'fit',
    help:
      "fit: each activity of a group is drawn over the group's whole time, so they all " +
      'finish together. real: they move at their real pace on one clock that starts slow ' +
      'and speeds up, sped up so that the longest fills the group; shorter ones finish ' +
      'first. One group at real pace is a race, with its clock as the headline.',
  },
  {
    name: 'overlap',
    label: 'Overlap',
    group: 'timing',
    kind: { type: 'number', min: 0, max: 80, unit: '%' },
    default: '0',
    help:
      'Lets the next group start before the current one has finished. At 40, it starts ' +
      'when the current one is 60% drawn. At 0, each group waits for the one before it.',
  },
  {
    name: 'pace',
    label: 'Drawing pace',
    group: 'timing',
    kind: { type: 'choice', choices: ['time', 'distance'] },
    default: 'time',
    help:
      'time: each activity is drawn as it was recorded, pauses shortened. distance: at ' +
      'an even speed along the route.',
  },
  {
    name: 'end-pause',
    label: 'End pause',
    group: 'timing',
    kind: { type: 'number', min: 0, max: 10, unit: 's' },
    default: '0',
    help:
      'Seconds the finished picture stays on screen after the replay, before the totals ' +
      'card, the end card or the end of the video. Added to the video’s length.',
  },

  {
    name: 'trim-radius',
    label: 'Trim start and finish',
    group: 'privacy',
    kind: { type: 'number', min: 0, max: 2000, unit: 'm' },
    default: '0',
    help:
      'Hide at least this radius in meters around each activity’s start and finish. 0 ' +
      'shows the full route.',
  },
  {
    name: 'camera',
    label: 'Camera',
    group: 'look',
    kind: { type: 'choice', choices: ['zoom', 'fixed', 'follow'] },
    default: 'zoom',
    help:
      'zoom: start close and pull back smoothly as the routes spread. fixed: show the ' +
      'whole area from the first frame. follow: track the moving end of each route, then ' +
      'pull back to show every route. Races, and activities drawn for under a second each, ' +
      'use zoom.',
  },
  {
    name: 'map',
    label: 'Street map',
    group: 'look',
    kind: { type: 'switch' },
    default: true,
    help: 'Draw the street map under the routes.',
  },
  {
    name: 'size',
    label: 'Frame size',
    group: 'look',
    kind: { type: 'size' },
    default: 'story',
    help: 'Frame size as WxH, or story (1080x1920), square (1080x1080) or landscape (1920x1080).',
  },
  {
    name: 'fps',
    label: 'Frames per second',
    group: 'look',
    kind: { type: 'choice', choices: ['24', '30', '60'] },
    default: '30',
    help: 'Frames per second.',
  },

  {
    name: 'title',
    label: 'Title',
    group: 'title',
    kind: { type: 'text', valueName: 'text' },
    default: null,
    automatic: 'made from the selection',
    help: 'Title of the video; "" for none.',
  },

  {
    name: 'widgets',
    label: 'Widgets',
    group: 'look',
    kind: { type: 'text', valueName: 'widgets' },
    default: null,
    automatic:
      'the title at the top, the values that suit the video at the bottom left (one ' +
      'activity: distance, time and the climb; a race: its clock, who is still out and the ' +
      'distance; a recap: the date, the activities, the distance and the climb; days in ' +
      'turn: the date, the distance, the climb and the time moving), and for a single ' +
      'activity the elevation chart along the bottom',
    help:
      'What is drawn over the replay, each widget centered on a point in percent across and ' +
      'down, with a size in percent (50 to 250, 100 when left out), separated by ";": ' +
      'text:"Your text"@x,y,size (text@x,y for the title), a value such as distance@x,y,size, ' +
      'or a chart, the activities end to end along their distance: elevation-chart, ' +
      'heart-rate-chart, power-chart, speed-chart or cadence-chart@x,y,size (one an activity ' +
      'recorded nothing for is left out). Later widgets are drawn over earlier ones; "" draws ' +
      'none. ' +
      'A value takes a label mode after a colon, as count:after@x,y: off (the value alone), ' +
      'before (total distance 1,147 km), after (25 activities), above or under (its words ' +
      'smaller, on a line above or under it). Left out, a value has its words under it; the ' +
      'date has none. Its own words, in double quotes after a colon, take the place of its ' +
      'usual ones, as distance:above:"so far"@x,y; "" leaves them out. nounit writes the ' +
      'number without its unit, as distance:nounit:"km"@x,y. A time, a date or a ' +
      'clock time also takes a format after a colon, as moving:hm@x,y or ' +
      'moving:after:hm@x,y: a time hms (54:38:25, the usual), hm (54:38), ' +
      'h (55 h) or d (2.3 days); the date dmy (8 May 2026, the usual), dm (8 May), wdm ' +
      '(Fri 8 May), mdy (May 8, 2026) or iso (2026-05-08); start and time-of-day 24h (06:42, ' +
      'the usual) or 12h (6:42 AM). ' +
      `The values: ${METRICS.join(', ')}. For several activities a plain value is ` +
      'their total (time, moving, distance, climb, descent, calories); avg-, max- and min- ' +
      'time, distance, climb and calories are per activity; the speeds, elevations and ' +
      'sensors are over every activity together. A value the video cannot show is left out: ' +
      `${SINGLE_ONLY.join(', ')} are for a single activity; count, days, moving-days and the ` +
      'per-activity ' +
      'values for several; the elevation values need recorded elevation. The average speed ' +
      'is over the moving time; speeds are minutes per kilometer when every activity is on ' +
      'foot, else km/h; max-speed is the fastest over 10 s, speed-now the speed over the ' +
      'last 10 s. The sensor values and calories need an activity that recorded them; ' +
      'cadence is steps per minute on foot.',
  },
  {
    name: 'totals-card',
    label: 'Totals card',
    group: 'look',
    kind: { type: 'switch' },
    default: false,
    help:
      `For several activities: their totals after the replay (${TOTALS_CARD_S} s more): ` +
      'activities, kilometers, hours moving and meters climbed. On with the recap preset.',
  },
  {
    name: 'totals-widgets',
    label: 'Totals card widgets',
    group: 'look',
    kind: { type: 'text', valueName: 'widgets' },
    default: null,
    automatic: 'activities, distance, moving time and climb, without the title',
    help:
      'What the totals card shows, as --widgets is written: text:"Your text"@x,y,size ' +
      `(text@x,y for the title) and totals such as distance@x,y,size: ${TOTALS_FIELDS.join(', ')}. ` +
      'A total is written as a value over the replay is at its end (312 km, total distance), ' +
      'and takes a label mode, words of its own and nounit as one does, as ' +
      'distance:above:"together"@x,y. ' +
      'As totals over every activity: count, time (hours, stops included), moving, distance, ' +
      'climb, descent and calories are added up; days are the calendar days from the first ' +
      'activity to the last, moving-days the days with an activity; avg-, max- and min- ' +
      'time, distance, climb and calories are per activity; the speeds, elevations and ' +
      'sensors are over every activity together; date is the days spanned. A total the ' +
      'activities did not ' +
      'record (elevation, the sensors, calories) is left out. A time, a date or a clock ' +
      'time takes a format as over the replay; a time is in hours unless told otherwise. ' +
      'The values fade in in their order and count up.',
  },
  {
    name: 'layout',
    label: 'Layout',
    group: 'look',
    kind: { type: 'choice', choices: [...LAYOUT_NAMES] },
    default: 'classic',
    help:
      'Where the widgets start when --widgets leaves them to the video, and the guides the web ' +
      'app shows while they are arranged: ' +
      LAYOUT_NAMES.map(
        (name) => `${name} (${LAYOUTS[name].help.toLowerCase().replace(/\.$/, '')})`,
      ).join('; ') +
      '. Each preset has its own.',
  },
  {
    name: 'units',
    label: 'Units',
    group: 'look',
    kind: { type: 'choice', choices: ['metric', 'imperial'] },
    default: 'metric',
    help:
      'metric: kilometers, meters, km/h, minutes per kilometer and °C. imperial: miles, feet, ' +
      'mph, minutes per mile and °F. For the values over the replay and on the totals card.',
  },

  {
    name: 'end-card',
    label: 'Show end card',
    group: 'brand',
    kind: { type: 'switch' },
    default: true,
    help:
      `End with the Wornways card after the replay (${END_CARD_S} s more): the map fades ` +
      'to black and the logo draws itself.',
  },
  {
    name: 'watermark',
    label: 'Show watermark',
    group: 'brand',
    kind: { type: 'switch' },
    default: true,
    help: 'Show the small Wornways mark at the bottom left, on the map credit line.',
  },
];

/** Settings accept text, booleans for switches, and exact ID lists for `activity`. */
export type SettingsInput = Record<string, string | boolean | readonly string[] | undefined>;

/** A value the user entered cannot be used. `message` reads on after the setting's name. */
export class SettingsError extends Error {
  readonly setting: string;

  constructor(setting: string, message: string) {
    super(message);
    this.name = 'SettingsError';
    this.setting = setting;
  }
}

function definition(name: string): SettingDefinition {
  const found = SETTINGS.find((s) => s.name === name);
  if (!found) throw new Error(`No setting is called "${name}"`);
  return found;
}

/** Start (or, with `end`, the moment after the end) of the named day, month or year, local time. */
function parseDay(name: string, value: string, end: boolean): number {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value);
  if (!m) throw new SettingsError(name, `expects YYYY-MM-DD, YYYY-MM or YYYY, got "${value}"`);
  const year = Number(m[1]);
  const month = Number(m[2] ?? 1) - 1;
  const day = Number(m[3] ?? 1);
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day)
    throw new SettingsError(name, `expects a valid calendar date, got "${value}"`);
  if (end && m[3] !== undefined) date.setUTCDate(day + 1);
  else if (end && m[2] !== undefined) date.setUTCMonth(month + 1);
  else if (end) date.setUTCFullYear(year + 1);
  const local = new Date(0);
  local.setFullYear(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return local.setHours(0, 0, 0, 0);
}

function parsePosition(name: string, value: string): LatLon {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(value);
  const position = m ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
  if (!position || Math.abs(position.lat) > 90 || Math.abs(position.lon) > 180)
    throw new SettingsError(name, `expects latitude,longitude, got "${value}"`);
  return position;
}

export function parseFrameSize(value: string): [width: number, height: number] {
  if (Object.hasOwn(SIZE_PRESETS, value)) return SIZE_PRESETS[value];
  const m = /^(\d+)x(\d+)$/.exec(value);
  if (!m) {
    const presets = Object.keys(SIZE_PRESETS).join(', ');
    throw new SettingsError('size', `expects WxH or one of ${presets}, got "${value}"`);
  }
  const [width, height] = [Number(m[1]), Number(m[2])];
  if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0 && n % 2 === 0))
    throw new SettingsError(
      'size',
      `needs even numbers (a video format requirement), got "${value}"`,
    );
  return [width, height];
}

/** A nonnegative decimal distance, accepting either decimal separator. */
export function parseDistanceKm(text: string): number {
  const value = text.trim();
  if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value)) return NaN;
  const km = Number(value.replace(',', '.'));
  return Number.isFinite(km) ? km : NaN;
}

/**
 * Turns what the user entered into settings, filling in the defaults.
 *
 * Throws a `SettingsError` for a value that cannot be used, and for one that is not a
 * setting.
 */
export function parseSettings(input: SettingsInput): RenderSettings {
  for (const name of Object.keys(input)) {
    if (input[name] !== undefined && !SETTINGS.some((s) => s.name === name))
      throw new SettingsError(name, 'is not a setting');
  }

  const presetName = input['preset'];
  if (presetName !== undefined && !PRESET_NAMES.includes(presetName as Preset))
    throw new SettingsError(
      'preset',
      `expects ${PRESET_NAMES.join(' or ')}, got "${String(presetName)}"`,
    );
  const preset = presetName === undefined ? {} : PRESETS[presetName as Preset].settings;

  /** The entered value, else the preset's, else the default; null when there is none. */
  const valueOf = (name: string) => input[name] ?? preset[name] ?? definition(name).default;
  const text = (name: string): string | null => {
    const value = valueOf(name);
    if (typeof value === 'boolean') throw new SettingsError(name, 'expects a value');
    if (value !== null && typeof value !== 'string') throw new SettingsError(name, 'expects text');
    return value;
  };
  const flag = (name: string): boolean => {
    const value = valueOf(name);
    if (typeof value !== 'boolean') throw new SettingsError(name, 'is a switch and takes no value');
    return value;
  };
  const number = (name: string): number => {
    const kind = definition(name).kind;
    if (kind.type !== 'number') throw new Error(`"${name}" is not a number setting`);
    const value = text(name) ?? '';
    const n = Number(value);
    if (value.trim() === '' || !Number.isFinite(n) || n < kind.min || n > kind.max)
      throw new SettingsError(
        name,
        `expects a number from ${kind.min} to ${kind.max}, got "${value}"`,
      );
    return n;
  };
  /** The widgets, or null when left to the other settings. */
  const widgetList = (
    name: string,
    metrics: readonly string[],
    options: { chart: boolean },
  ): Widget[] | null => {
    const value = text(name);
    if (value === null) return null;
    try {
      return parseWidgets(value, metrics, options);
    } catch (error) {
      throw new SettingsError(name, error instanceof Error ? error.message : String(error));
    }
  };
  const choice = <T extends string>(name: string): T => {
    const kind = definition(name).kind;
    if (kind.type !== 'choice') throw new Error(`"${name}" is not a choice setting`);
    const value = text(name) ?? '';
    if (!kind.choices.includes(value))
      throw new SettingsError(name, `expects ${kind.choices.join(' or ')}, got "${value}"`);
    return value as T;
  };

  const fromText = text('from');
  const toText = text('to');
  const from = fromText === null ? null : parseDay('from', fromText, false);
  const to = toText === null ? null : parseDay('to', toText, true);
  if (from !== null && to !== null && to <= from)
    throw new SettingsError('to', 'is before the period start');

  const activity = valueOf('activity');
  if (typeof activity === 'boolean') throw new SettingsError('activity', 'expects a value');
  const ids =
    typeof activity === 'string'
      ? activity
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : activity;
  const activities = ids === null ? null : [...new Set(ids)];
  if (activities !== null && activities.length === 0)
    throw new SettingsError('activity', 'expects activity ids separated by commas');

  const sportText = text('sport');
  const sports = sportText === null ? null : sportText.split(',').map(sportSlug).filter(Boolean);
  if (sports !== null && sports.length === 0)
    throw new SettingsError('sport', `expects sports separated by commas, got "${sportText}"`);

  const distance = (name: string): number | null => {
    const value = text(name);
    if (value === null) return null;
    const km = parseDistanceKm(value);
    if (Number.isNaN(km))
      throw new SettingsError(name, `expects a distance of 0 km or more, got "${value}"`);
    return km;
  };
  const minDistanceKm = distance('min-distance');
  const maxDistanceKm = distance('max-distance');
  if (minDistanceKm !== null && maxDistanceKm !== null && minDistanceKm > maxDistanceKm)
    throw new SettingsError('max-distance', 'is below the minimum distance');

  /** A place filter: its place and radius, or null when no place is given. */
  const near = (place: string, radius: string): NearPlace | null => {
    const placeText = text(place);
    if (placeText !== null)
      return { place: parsePosition(place, placeText), radius: number(radius) };
    if (input[radius] !== undefined) throw new SettingsError(radius, `only applies with ${place}`);
    return null;
  };
  const [width, height] = parseFrameSize(text('size') ?? '');

  return {
    from,
    to,
    activities,
    sports,
    minDistanceKm,
    maxDistanceKm,
    startNear: near('start-near', 'start-radius'),
    endNear: near('end-near', 'end-radius'),
    duration: number('duration'),
    group: choice<'auto' | Grouping>('group'),
    share: choice<'even' | 'distance'>('share'),
    groupPace: choice<'fit' | 'real'>('group-pace'),
    overlap: number('overlap'),
    pace: choice<'time' | 'distance'>('pace'),
    endPause: number('end-pause'),
    trimRadius: number('trim-radius'),
    camera: choice<RenderSettings['camera']>('camera'),
    units: choice<RenderSettings['units']>('units'),
    layout: choice<RenderSettings['layout']>('layout'),
    map: flag('map'),
    title: text('title'),
    width,
    height,
    fps: Number(choice('fps')),
    widgets: widgetList('widgets', METRICS, { chart: true }),
    totalsCard: flag('totals-card'),
    totalsWidgets: widgetList('totals-widgets', TOTALS_FIELDS, { chart: false }),
    endCard: flag('end-card'),
    watermark: flag('watermark'),
  };
}
