// The settings of a replay video.
//
// `SETTINGS` describes every setting once: its name, the values it takes and its default.
// Front ends build their flags or controls from that table and
// turn what the user entered into `RenderSettings` with `parseSettings`.

import { sportSlug } from '../import/index-csv.ts';
import type { LatLon } from '../track/places.ts';
import { END_CARD_S } from './end-card.ts';
import { PRESETS, PRESET_NAMES, type Preset } from './presets.ts';
import type { Grouping } from './plans.ts';
import { METRICS, POSITIONS, type Metric, type Position } from './render.ts';

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

  /** Hide routes within this many metres of their start or finish. Zero shows the full route. */
  trimRadius: number;

  // Look
  camera: 'zoom' | 'fixed' | 'follow';
  map: boolean;
  width: number;
  height: number;
  fps: number;

  // Title
  /** null: a title made from the selection; empty: no title. */
  title: string | null;
  titlePosition: Position;
  /** Size of the title in percent of the normal size. */
  titleSize: number;

  // Metrics card
  /** Whether the values over the map are shown. */
  metrics: boolean;
  /** The values in order, the first one large; null: what suits the video. */
  metricsFields: Metric[] | null;
  metricsPosition: Position;
  /** Size of the metrics card in percent of the normal size. */
  metricsSize: number;

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

export type SettingGroup =
  'activities' | 'timing' | 'privacy' | 'look' | 'title' | 'metrics' | 'brand';

export const GROUP_LABELS: Record<SettingGroup, string> = {
  activities: 'Which activities',
  timing: 'Timing',
  privacy: 'Replay privacy',
  look: 'Look',
  title: 'Title',
  metrics: 'Metrics card',
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
    name: 'trim-radius',
    label: 'Trim start and finish',
    group: 'privacy',
    kind: { type: 'number', min: 0, max: 2000, unit: 'm' },
    default: '0',
    help: 'Radius in metres around each activity’s start and finish. 0 shows the full route.',
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
      'pull back to show every route. Races use zoom.',
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
    name: 'title-position',
    label: 'Title position',
    group: 'title',
    kind: { type: 'choice', choices: POSITIONS },
    default: 'top-left',
    help:
      'Where the title sits: a row (top, middle or bottom) and a side. Where it would meet the ' +
      'metrics card, the two stack, the title first.',
  },
  {
    name: 'title-size',
    label: 'Title size',
    group: 'title',
    kind: { type: 'number', min: 50, max: 200, unit: '%' },
    default: '100',
    help: 'Size of the title, in percent of the normal size.',
  },

  {
    name: 'metrics',
    label: 'Show card',
    group: 'metrics',
    kind: { type: 'switch' },
    default: true,
    help: 'Show the metrics card: the values over the map.',
  },
  {
    name: 'metrics-fields',
    label: 'Values',
    group: 'metrics',
    kind: { type: 'list', choices: METRICS },
    default: null,
    automatic: 'what suits the video',
    help:
      `Values to show, the first one large: ${METRICS.join(', ')}. A value the video ` +
      'cannot show is left out: pace is for a single activity, count for several ' +
      'activities, date not in a race (one group at real pace), elevation only when recorded.',
  },
  {
    name: 'metrics-position',
    label: 'Position',
    group: 'metrics',
    kind: { type: 'choice', choices: POSITIONS },
    default: 'bottom-left',
    help: 'Where the metrics card sits: a row (top, middle or bottom) and a side.',
  },
  {
    name: 'metrics-size',
    label: 'Card size',
    group: 'metrics',
    kind: { type: 'number', min: 50, max: 200, unit: '%' },
    default: '100',
    help: 'Size of the metrics card, in percent of the normal size.',
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
    help: 'Show the small Wornways mark at the bottom right, on the map credit line.',
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
  if (m[2] === undefined) return new Date(year + (end ? 1 : 0), 0, 1).getTime();
  const month = Number(m[2]) - 1;
  if (m[3] === undefined) return new Date(year, month + (end ? 1 : 0), 1).getTime();
  return new Date(year, month, Number(m[3]) + (end ? 1 : 0)).getTime();
}

function parsePosition(name: string, value: string): LatLon {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(value);
  const position = m ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
  if (!position || Math.abs(position.lat) > 90 || Math.abs(position.lon) > 180)
    throw new SettingsError(name, `expects latitude,longitude, got "${value}"`);
  return position;
}

function parseSize(name: string, value: string): [width: number, height: number] {
  const preset = SIZE_PRESETS[value];
  if (preset) return preset;
  const m = /^(\d+)x(\d+)$/.exec(value);
  if (!m) {
    const presets = Object.keys(SIZE_PRESETS).join(', ');
    throw new SettingsError(name, `expects WxH or one of ${presets}, got "${value}"`);
  }
  const [width, height] = [Number(m[1]), Number(m[2])];
  if (width === 0 || height === 0 || width % 2 || height % 2)
    throw new SettingsError(
      name,
      `needs even numbers (a video format requirement), got "${value}"`,
    );
  return [width, height];
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

  const fieldsText = text('metrics-fields');
  const metricsFields =
    fieldsText === null ? null : fieldsText.split(',').map((field) => field.trim().toLowerCase());
  const unknownField = metricsFields?.find((field) => !METRICS.includes(field as Metric));
  if (metricsFields !== null && (fieldsText?.trim() === '' || unknownField !== undefined))
    throw new SettingsError(
      'metrics-fields',
      `expects values from ${METRICS.join(', ')}, got "${unknownField ?? fieldsText}"`,
    );

  /** A place filter: its place and radius, or null when no place is given. */
  const near = (place: string, radius: string): NearPlace | null => {
    const placeText = text(place);
    if (placeText !== null)
      return { place: parsePosition(place, placeText), radius: number(radius) };
    if (input[radius] !== undefined) throw new SettingsError(radius, `only applies with ${place}`);
    return null;
  };
  const [width, height] = parseSize('size', text('size') ?? '');

  return {
    from,
    to,
    activities,
    sports,
    startNear: near('start-near', 'start-radius'),
    endNear: near('end-near', 'end-radius'),
    duration: number('duration'),
    group: choice<'auto' | Grouping>('group'),
    share: choice<'even' | 'distance'>('share'),
    groupPace: choice<'fit' | 'real'>('group-pace'),
    overlap: number('overlap'),
    pace: choice<'time' | 'distance'>('pace'),
    trimRadius: number('trim-radius'),
    camera: choice<RenderSettings['camera']>('camera'),
    map: flag('map'),
    title: text('title'),
    titlePosition: choice<Position>('title-position'),
    titleSize: number('title-size'),
    width,
    height,
    fps: Number(choice('fps')),
    metrics: flag('metrics'),
    metricsFields: metricsFields === null ? null : ([...new Set(metricsFields)] as Metric[]),
    metricsPosition: choice<Position>('metrics-position'),
    metricsSize: number('metrics-size'),
    endCard: flag('end-card'),
    watermark: flag('watermark'),
  };
}
