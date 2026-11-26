// The Video and Overlay steps: which settings they offer, how they are labeled, and the
// settings that what the person set there stands for. Their controls are built from the
// engine's settings table, so they offer the same settings as the command-line tool.

import {
  PRESETS,
  PRESET_NAMES,
  SETTINGS,
  defaultFormat,
  type LabelMode,
  type Metric,
  type MetricValue,
  type Preset,
  type SettingDefinition,
  type SettingGroup,
  type SettingsInput,
  type ValueFormat,
  type Widget,
} from '@wornways/engine';
import type { PlanReport } from './messages.ts';

/** What the person changed in the editor, by setting name; the rest keeps its default. */
export type Adjustments = Record<string, string | boolean>;

/** The panels of Fine-tune playback, in the Playback section. */
export const PLAYBACK_PANELS: Panel[] = ['timing', 'camera'];

/**
 * The sections of the editor, in the order things are decided: where the video will be
 * posted, how the routes play, the map, what is drawn over the replay, and what comes after
 * it. Frame and Playback have controls of their own; the others are panels.
 */
export type Section = 'frame' | 'playback' | 'map' | 'overlay' | 'ending';
export const SECTIONS: { id: Section; label: string; panels: Panel[] }[] = [
  { id: 'frame', label: 'Frame', panels: [] },
  { id: 'playback', label: 'Playback', panels: [] },
  { id: 'map', label: 'Map', panels: ['map', 'privacy'] },
  {
    id: 'overlay',
    label: 'Overlay',
    // The widgets are arranged on the still (WidgetEditor) and listed above the units and
    // the watermark.
    panels: ['units', 'watermark'],
  },
  {
    id: 'ending',
    label: 'Ending',
    panels: ['pause', 'totals', 'end-card'],
  },
];

/** The preset picked, or Custom: the settings as set under Fine-tune. */
export type PresetChoice = Preset | 'custom';

/** How many activities the video shows, which decides the presets offered. */
export type ActivityCount = 'one' | 'several';
export const countOf = (activities: number): ActivityCount =>
  activities === 1 ? 'one' : 'several';

/** Where the preset is kept: a single activity and several remember their own. */
const presetKey = (count: ActivityCount) => (count === 'one' ? 'preset-one' : 'preset');
// The end pause is set in the Ending section, outside the playback a preset decides.
const PLAYBACK_SETTINGS = SETTINGS.filter(
  ({ group, name }) =>
    (group === 'timing' && name !== 'preset' && name !== 'end-pause') || name === 'camera',
).map(({ name }) => name);
const adjustmentKey = (name: string, count: ActivityCount) =>
  count === 'one' && PLAYBACK_SETTINGS.includes(name) ? `one-${name}` : name;
/** The presets offered for this many activities. Custom is not offered: it is what changing their values makes. */
export const presetChoices = (count: ActivityCount): Preset[] =>
  PRESET_NAMES.filter((name) => PRESETS[name].activities === count);

/** The preset the adjustments use for this many activities; the first one until one is picked. */
export function presetOf(adjustments: Adjustments, count: ActivityCount): PresetChoice {
  const picked = adjustments[presetKey(count)] as PresetChoice;
  const offered = presetChoices(count);
  return picked === 'custom' || offered.includes(picked as Preset) ? picked : offered[0]!;
}

export const PRESET_LABELS: Record<PresetChoice, string> = {
  recap: 'Recap',
  'all-at-once': 'All at once',
  'multiday-trip': 'Multiday trip',
  highlight: 'Highlight',
  custom: 'Custom',
};

/** What each preset plays, in a line for its card. */
export const PRESET_LINES: Record<PresetChoice, string> = {
  recap: 'Your activities one after another, grouped automatically by day, week or month.',
  'all-at-once': 'Every activity starts together and traces its route at its real pace.',
  'multiday-trip':
    'Each day in turn, with longer days getting more screen time and the camera following the route.',
  highlight: 'A 15-second clip with the camera following the route.',
  custom: 'Your own settings, set under Fine-tune playback.',
};

/** The values the preset gives its settings, by setting name; none for Custom. */
const presetValues = (preset: PresetChoice): Adjustments =>
  preset === 'custom' ? {} : PRESETS[preset].settings;

/** The preset's values of the playback settings: the preset decides these. */
const presetPlayback = (preset: PresetChoice): Adjustments =>
  Object.fromEntries(
    Object.entries(presetValues(preset)).filter(([name]) => PLAYBACK_SETTINGS.includes(name)),
  );

/**
 * The preset's values of other settings, such as the totals card: where they start, until
 * the person sets them in the editor.
 */
const presetStarting = (preset: PresetChoice): Adjustments =>
  Object.fromEntries(
    Object.entries(presetValues(preset)).filter(([name]) => !PLAYBACK_SETTINGS.includes(name)),
  );

/**
 * Where a setting outside playback starts until it is set: the current preset's value;
 * undefined: its default.
 */
export function startingValue(
  adjustments: Adjustments,
  count: ActivityCount,
  name: string,
): string | boolean | undefined {
  return presetStarting(presetOf(adjustments, count))[name];
}

/** The settings shown under Fine-tune, with the current preset's values applied. */
export const playbackAdjustments = (
  adjustments: Adjustments,
  count: ActivityCount,
): Adjustments => {
  const values: Adjustments = {};
  for (const name of PLAYBACK_SETTINGS) {
    const value = adjustments[adjustmentKey(name, count)];
    if (value !== undefined) values[name] = value;
  }
  return { ...values, ...presetPlayback(presetOf(adjustments, count)) };
};

/** The settings that hold the widgets: over the replay, and on the totals card. */
const WIDGET_SETTINGS = ['widgets', 'totals-widgets'];

/** The adjustments without widgets: the video starts from the ones that suit it. */
export const withoutWidgets = (adjustments: Adjustments): Adjustments =>
  Object.fromEntries(
    Object.entries(adjustments).filter(([name]) => !WIDGET_SETTINGS.includes(name)),
  );

/**
 * Picks a preset for this selection size, which starts the playback over from it: what was
 * fine-tuned for this size goes. Another preset sets the widgets too: they start again from
 * the ones that suit the video it makes; the preset in use, picked again, keeps them. Custom
 * (the playback kept as set) keeps everything.
 */
export function withPreset(
  adjustments: Adjustments,
  preset: PresetChoice,
  count: ActivityCount,
): Adjustments {
  const key = presetKey(count);
  if (preset === 'custom') return { ...adjustments, [key]: preset };
  const tuned = new Set(PLAYBACK_SETTINGS.map((name) => adjustmentKey(name, count)));
  const picked = {
    ...Object.fromEntries(Object.entries(adjustments).filter(([name]) => !tuned.has(name))),
    [key]: preset,
  };
  return preset === presetOf(adjustments, count) ? picked : withoutWidgets(picked);
}

/**
 * The adjustments after editing the effective values under Fine-tune. Changing a setting the preset sets turns
 * the preset into Custom, starting from its values (also those of other sections, such as
 * the totals card, where the person has not set them); any other change keeps the preset.
 */
export function fineTuned(
  before: Adjustments,
  after: Adjustments,
  count: ActivityCount,
): Adjustments {
  const preset = presetOf(before, count);
  const values = presetPlayback(preset);
  const effective = playbackAdjustments(before, count);
  const changed = PLAYBACK_SETTINGS.filter((name) => after[name] !== effective[name]);
  const custom = changed.some((name) => Object.hasOwn(values, name));
  const tuned = new Map(Object.entries(custom ? withPreset(before, 'custom', count) : before));
  if (custom)
    for (const [name, value] of Object.entries(presetStarting(preset)))
      if (!tuned.has(name)) tuned.set(name, value);
  for (const name of custom ? PLAYBACK_SETTINGS : changed) {
    const key = adjustmentKey(name, count);
    if (after[name] === undefined) tuned.delete(key);
    else tuned.set(key, after[name]);
  }
  return Object.fromEntries(tuned);
}

/** Every group the editor offers. Which activities are chosen in a popup of their own. */
const ADJUST_GROUPS: SettingGroup[] = ['timing', 'privacy', 'look', 'brand'];

/** Shorter labels for the screen than the settings table's. */
const LABELS: Record<string, string> = {
  duration: 'Video duration',
  size: 'Size',
  map: 'Street map',
};

/** The words shown for a choice's values. */
const CHOICE_LABELS: Record<string, Record<string, string>> = {
  group: {
    auto: 'Automatic',
    activity: 'Activity',
    day: 'Day',
    week: 'Week',
    month: 'Month',
    all: 'All',
  },
  share: { even: 'Even', distance: 'By distance' },
  'group-pace': { fit: 'Fit to the group', real: 'Real pace' },
  pace: { time: 'As recorded', distance: 'Even speed' },
  camera: { zoom: 'Zooms out', fixed: 'Fixed', follow: 'Follows' },
  units: { metric: 'Metric', imperial: 'Imperial' },
};

/** One line of explanation under a few settings. */
const HINTS: Record<string, string> = {
  duration: 'The video is exactly this long.',
  'duration-one':
    'One activity plays at its own pace: 15 to 60 s depending on how long it was, never ' +
    'longer than this.',
  group:
    'Which activities play together as one group: a single activity, the activities of a ' +
    'day, a week or a month, or all of them. The groups play one after another. Automatic ' +
    'makes each activity a group, or each day, week or month when there are too many ' +
    'activities to follow.',
  share: 'Even: every group gets the same time. By distance: longer groups get more time.',
  'group-pace':
    "Fit to the group: a group's activities all finish together. Real pace: they move at " +
    'their real speeds, so shorter ones finish first. All at real pace is a race.',
  overlap:
    'Lets the next group start before the current one has finished. At 40%, it starts ' +
    'when the current one is 60% drawn. At 0%, each group waits for the one before it.',
  pace:
    'As recorded: each activity is drawn at its real speed, slower up the climbs and faster ' +
    'down them, with long stops shortened. Even speed: at one steady speed along the route.',
  camera:
    'Follows the moving route and pulls back at the end. Activities within each group ' +
    'play in turn with this camera. Races, and activities too short to follow, use Zooms out.',
  'end-pause':
    'How long the finished picture stays on screen at the end, before the totals and the ' +
    'end card. Added to the video’s length.',
  'trim-radius': 'Hide the route within this radius of each activity’s start and finish.',
  units:
    'Metric: km, m, km/h, min/km and °C. Imperial: mi, ft, mph, min/mi and °F. For the values ' +
    'over the replay and on the totals card; heart rate, power, cadence and calories stay ' +
    'as they are.',
  'totals-card':
    'After the replay, a few seconds of totals: activities, kilometers, hours moving and ' +
    'meters climbed. On for Recap.',
};

/** Steps of the number sliders. */
const STEPS: Record<string, number> = {
  duration: 1,
  overlap: 10,
  'end-pause': 0.5,
  'trim-radius': 50,
};

export const settingLabel = (setting: SettingDefinition) => LABELS[setting.name] ?? setting.label;

export const choiceLabel = (setting: string, value: string) =>
  CHOICE_LABELS[setting]?.[value] ?? value;

/** The hint under a setting; the duration's says something else for a single activity. */
export const settingHint = (setting: string, count: ActivityCount) =>
  (count === 'one' ? HINTS[`${setting}-one`] : undefined) ?? HINTS[setting] ?? '';

export const sliderStep = (setting: string) => STEPS[setting] ?? 1;

/** A panel of settings in the editor's sections. */
export type Panel =
  'timing' | 'camera' | 'privacy' | 'map' | 'units' | 'watermark' | 'pause' | 'totals' | 'end-card';

/** The settings of each panel on the screens, in order: mostly the settings table's groups. */
const PANELS: Record<Panel, string[]> = {
  // The video's length has a control of its own above Fine-tune playback.
  timing: ['group', 'share', 'group-pace', 'overlap', 'pace'],
  camera: ['camera'],
  privacy: ['trim-radius'],
  map: ['map'],
  units: ['units'],
  watermark: ['watermark'],
  pause: ['end-pause'],
  totals: ['totals-card'],
  'end-card': ['end-card'],
};

/**
 * Whether a panel has something to set for this video: the totals card only for several
 * activities. Until the plan is known, the totals card shows.
 */
export function panelOffered(panel: Panel, plan: PlanReport | null | undefined): boolean {
  if (panel === 'totals') return !plan || plan.activities > 1;
  return true;
}

/** The frame rates offered in the Frame section, from the settings table. */
export const FRAME_RATES: readonly string[] = (() => {
  const kind = SETTINGS.find((s) => s.name === 'fps')!.kind;
  return kind.type === 'choice' ? kind.choices : ['30'];
})();

/** The frame sizes offered in the Frame section, by name. */
export const SIZE_LABELS: Record<string, string> = {
  story: 'Story 9:16',
  square: 'Square 1:1',
  landscape: 'Landscape 16:9',
};

/** The settings of a panel, in order. */
export function offered(panel: Panel): SettingDefinition[] {
  return PANELS[panel].map((name) => SETTINGS.find((s) => s.name === name)!);
}

/**
 * The value a setting has: under a preset, the preset's for the settings it sets; else the
 * one set, else its default. null when there is none.
 */
export function valueOf(
  adjustments: Adjustments,
  setting: SettingDefinition,
  count: ActivityCount,
): string | boolean | null {
  const preset = presetOf(adjustments, count);
  return (
    presetPlayback(preset)[setting.name] ??
    adjustments[adjustmentKey(setting.name, count)] ??
    startingValue(adjustments, count, setting.name) ??
    setting.default
  );
}

/**
 * The settings the adjustments stand for: only the ones the editor offers, so something
 * remembered from an earlier version of the app (such as a mode) does not get in the way.
 */
export function adjustSettings(adjustments: Adjustments, count: ActivityCount): SettingsInput {
  const preset = presetOf(adjustments, count);
  // Under a preset, the settings it sets come from it, not from values set under Custom.
  const fromPreset = presetPlayback(preset);
  const settings: SettingsInput = {};
  for (const setting of SETTINGS) {
    const value = adjustments[adjustmentKey(setting.name, count)];
    if (value === undefined || setting.name === 'preset' || setting.name in fromPreset) continue;
    if (ADJUST_GROUPS.includes(setting.group)) settings[setting.name] = value;
  }
  if (preset !== 'custom') settings['preset'] = preset;
  return settings;
}

const STORAGE_KEY = 'wornways-adjustments';

/** The adjustments made on an earlier visit; none when there are none or storage is off. */
export function loadAdjustments(): Adjustments {
  let stored: unknown = {};
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    // Unreadable, or no storage: a fresh start.
  }
  return fromEarlierVersions(stored && typeof stored === 'object' ? (stored as Adjustments) : {});
}
/**
 * Marks the adjustments saved by this version of the app. Adjustments saved by an earlier one
 * are not carried over: the app starts afresh instead, as its settings have changed.
 */
const SAVED_WITH = 'saved-with';
const THIS_VERSION = 'widgets';

/** The adjustments as stored, when this version saved them; else a fresh start. */
export function fromEarlierVersions(adjustments: Adjustments): Adjustments {
  return adjustments[SAVED_WITH] === THIS_VERSION ? adjustments : { [SAVED_WITH]: THIS_VERSION };
}
export function saveAdjustments(adjustments: Adjustments): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(adjustments));
  } catch {
    // Without storage the adjustments last until the page is closed.
  }
}

/** A value's name: its metric's, or a few words where the name alone would be unclear. */
/**
 * A value's name when the video does not give one (its value is not known yet): the video's
 * own names say more, as "Total distance" for several activities or "Race time" in a race.
 */
const METRIC_NAMES: Partial<Record<Metric, string>> = {
  moving: 'Moving time',
  'avg-time': 'Avg time per activity',
  'max-time': 'Max time per activity',
  'min-time': 'Min time per activity',
  start: 'Start time',
  'time-of-day': 'Time of day',
  'avg-distance': 'Avg distance per activity',
  'max-distance': 'Max distance per activity',
  'min-distance': 'Min distance per activity',
  'avg-speed': 'Avg speed',
  'max-speed': 'Max speed',
  'speed-now': 'Current speed',
  'avg-climb': 'Avg climb per activity',
  'max-climb': 'Max climb per activity',
  'min-climb': 'Min climb per activity',
  'max-elevation': 'Max elevation',
  'min-elevation': 'Min elevation',
  'elevation-now': 'Current elevation',
  'avg-heart-rate': 'Avg heart rate',
  'max-heart-rate': 'Max heart rate',
  'min-heart-rate': 'Min heart rate',
  'heart-rate-now': 'Current heart rate',
  'avg-power': 'Avg power',
  'max-power': 'Max power',
  'power-now': 'Current power',
  'avg-cadence': 'Avg cadence',
  'max-cadence': 'Max cadence',
  'cadence-now': 'Current cadence',
  'avg-temperature': 'Avg temperature',
  'min-temperature': 'Min temperature',
  'max-temperature': 'Max temperature',
  'temperature-now': 'Current temperature',
  'avg-calories': 'Avg calories per activity',
  'max-calories': 'Max calories per activity',
  'min-calories': 'Min calories per activity',
  count: 'Activities',
  days: 'Days',
  'moving-days': 'Moving days',
};
/** A value's name: the one the video gives it, else its usual one. */
export const metricName = (metric: Metric, values?: Map<Metric, MetricValue>) =>
  values?.get(metric)?.name ??
  METRIC_NAMES[metric] ??
  metric.charAt(0).toUpperCase() + metric.slice(1);

/**
 * The values by what they measure, as the Metrics sheet groups them: each group's values side
 * by side (the average, the highest, the value as one activity plays…).
 */
export const METRIC_GROUPS: { name: string; metrics: Metric[] }[] = [
  {
    name: 'Time',
    metrics: ['time', 'moving', 'avg-time', 'max-time', 'min-time', 'start', 'time-of-day'],
  },
  { name: 'Distance', metrics: ['distance', 'avg-distance', 'max-distance', 'min-distance'] },
  { name: 'Speed', metrics: ['avg-speed', 'max-speed', 'speed-now'] },
  {
    name: 'Elevation',
    metrics: [
      'climb',
      'descent',
      'avg-climb',
      'max-climb',
      'min-climb',
      'max-elevation',
      'min-elevation',
      'elevation-now',
    ],
  },
  {
    name: 'Heart rate',
    metrics: ['avg-heart-rate', 'max-heart-rate', 'min-heart-rate', 'heart-rate-now'],
  },
  { name: 'Power', metrics: ['avg-power', 'max-power', 'power-now'] },
  { name: 'Cadence', metrics: ['avg-cadence', 'max-cadence', 'cadence-now'] },
  {
    name: 'Temperature',
    metrics: ['avg-temperature', 'min-temperature', 'max-temperature', 'temperature-now'],
  },
  { name: 'Calories', metrics: ['calories', 'avg-calories', 'max-calories', 'min-calories'] },
  { name: 'Activities', metrics: ['count', 'days', 'moving-days', 'date'] },
];

/** How a value's label modes are named: in the strip's chip and its sheet. */
export const LABEL_MODE_NAMES: Record<LabelMode, string> = {
  off: 'Off',
  short: 'Short',
  inline: 'Inline',
  under: 'Under',
};

/** The names of the ways a time, a date or a clock time can be written. */
export const FORMAT_NAMES: Record<ValueFormat, string> = {
  hms: 'h:mm:ss',
  hm: 'h:mm',
  h: 'Hours',
  d: 'Days',
  dmy: 'Day month year',
  dm: 'Day month',
  wdm: 'With weekday',
  mdy: 'Month day, year',
  iso: 'Numeric',
  '24h': '24-hour',
  '12h': '12-hour',
};

/** The format a value widget is written in: its own, else the value's usual one. */
export const formatOf = (widget: Widget, card: boolean): ValueFormat | null =>
  widget.kind === 'metric' ? (widget.format ?? defaultFormat(widget.metric, card)) : null;

/** A widget's name in the list: "Text", a value's name, or "Elevation chart". */
export const widgetLabel = (widget: Widget, values?: Map<Metric, MetricValue>) =>
  widget.kind === 'text'
    ? 'Text'
    : widget.kind === 'metric'
      ? metricName(widget.metric, values)
      : 'Elevation chart';
