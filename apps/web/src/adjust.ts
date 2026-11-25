// The Video and Overlay steps: which settings they offer, how they are labeled, and the
// settings that what the person set there stands for. Their controls are built from the
// engine's settings table, so they offer the same settings as the command-line tool.

import {
  PRESETS,
  PRESET_NAMES,
  SETTINGS,
  type Preset,
  type SettingDefinition,
  type SettingGroup,
  type SettingsInput,
} from '@wornways/engine';
import type { PlanReport } from './messages.ts';

/** What the person changed in the Video and Overlay steps, by setting name; the rest keeps its default. */
export type Adjustments = Record<string, string | boolean>;

/**
 * Whether the title is shown, kept apart from the title's text so that a title written
 * comes back when it is switched on again. Not a setting of its own: off means no title.
 */
export const SHOW_TITLE = 'show-title';

/** The panels of Fine-tune playback, in the Playback section. */
export const PLAYBACK_PANELS: Panel[] = ['timing', 'camera'];

/**
 * The sections of the Design step, in the order things are decided: where the video will be
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
    panels: ['title', 'metrics', 'elevation', 'watermark'],
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
 * the person sets them in the Design step.
 */
const presetStarting = (preset: PresetChoice): Adjustments =>
  Object.fromEntries(
    Object.entries(presetValues(preset)).filter(([name]) => !PLAYBACK_SETTINGS.includes(name)),
  );

/**
 * Where a setting outside playback starts until it is set: the current preset's value,
 * or the elevation profile's, which the engine leaves to the video (on for one activity,
 * off for several); undefined: its default.
 */
export function startingValue(
  adjustments: Adjustments,
  count: ActivityCount,
  name: string,
): string | boolean | undefined {
  const fromPreset = presetStarting(presetOf(adjustments, count))[name];
  if (fromPreset !== undefined) return fromPreset;
  if (name === 'elevation-profile') return count === 'one';
  return undefined;
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

/** Picks a preset for this selection size. */
export function withPreset(
  adjustments: Adjustments,
  preset: PresetChoice,
  count: ActivityCount,
): Adjustments {
  const key = presetKey(count);
  return { ...adjustments, [key]: preset };
}

/**
 * Back to the default playback for this selection size: its first preset (see
 * `presetChoices`), with nothing fine-tuned.
 */
export function resetPlayback(adjustments: Adjustments, count: ActivityCount): Adjustments {
  const names = new Set([
    presetKey(count),
    ...PLAYBACK_SETTINGS.map((name) => adjustmentKey(name, count)),
  ]);
  return Object.fromEntries(Object.entries(adjustments).filter(([name]) => !names.has(name)));
}

/**
 * The adjustments after editing the effective values under Fine-tune. Changing a setting the preset sets turns
 * the preset into Custom, starting from its values (also those of other steps, such as the
 * totals card, where the person has not set them); any other change keeps the preset.
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

/** Every group the two steps offer. Which activities are chosen in the step before them. */
const ADJUST_GROUPS: SettingGroup[] = ['timing', 'privacy', 'look', 'title', 'metrics', 'brand'];

/** Shorter labels for the screen than the settings table's. */
const LABELS: Record<string, string> = {
  duration: 'Video duration',
  size: 'Size',
  map: 'Street map',
  title: 'Text',
  'title-position': 'Position',
  'title-size': 'Size',
  metrics: 'Show metrics',
  'metrics-fields': 'Metrics',
  'totals-fields': 'Values',
  'metrics-position': 'Position',
  'metrics-size': 'Size',
};

const POSITION_LABELS = {
  'top-left': 'Top left',
  'top-center': 'Top middle',
  'top-right': 'Top right',
  'middle-left': 'Middle left',
  'middle-center': 'Center',
  'middle-right': 'Middle right',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom middle',
  'bottom-right': 'Bottom right',
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
  'title-position': POSITION_LABELS,
  'metrics-position': POSITION_LABELS,
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
  'metrics-fields': 'In the order picked; the first is shown large.',
  'totals-fields': 'In the order picked.',
  'elevation-profile':
    'The climb profile along the bottom of the video, with a dot that follows the activity. ' +
    'For several activities, they are laid end to end; off unless switched on.',
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
  'title-size': 10,
  'metrics-size': 10,
};

export const settingLabel = (setting: SettingDefinition) => LABELS[setting.name] ?? setting.label;

export const choiceLabel = (setting: string, value: string) =>
  CHOICE_LABELS[setting]?.[value] ?? value;

/** The hint under a setting; the duration's says something else for a single activity. */
export const settingHint = (setting: string, count: ActivityCount) =>
  (count === 'one' ? HINTS[`${setting}-one`] : undefined) ?? HINTS[setting] ?? '';

export const sliderStep = (setting: string) => STEPS[setting] ?? 1;

/** A panel of settings in the Design step's sections. */
export type Panel =
  | 'timing'
  | 'camera'
  | 'privacy'
  | 'map'
  | 'title'
  | 'metrics'
  | 'elevation'
  | 'watermark'
  | 'pause'
  | 'totals'
  | 'end-card';

/** The settings of each panel on the screens, in order: mostly the settings table's groups. */
const PANELS: Record<Panel, string[]> = {
  // The video's length has a control of its own above Fine-tune playback.
  timing: ['group', 'share', 'group-pace', 'overlap', 'pace'],
  camera: ['camera'],
  privacy: ['trim-radius'],
  map: ['map'],
  title: ['title', 'title-position', 'title-size'],
  metrics: ['metrics', 'metrics-fields', 'metrics-position', 'metrics-size'],
  elevation: ['elevation-profile'],
  watermark: ['watermark'],
  pause: ['end-pause'],
  totals: ['totals-card', 'totals-fields'],
  'end-card': ['end-card'],
};

/**
 * Whether a panel has something to set for this video: the elevation profile only when an
 * activity recorded elevation, the totals card only for several activities. Until the plan
 * is known, the totals card shows; the elevation profile waits for it.
 */
export function panelOffered(panel: Panel, plan: PlanReport | null | undefined): boolean {
  if (panel === 'elevation') return !!plan && plan.hasElevation;
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
 * The settings the adjustments stand for: only the ones the steps offer, so something
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
  // The title switched off is an empty title; the text written stays for switching it on.
  if (adjustments[SHOW_TITLE] === false) settings['title'] = '';
  return settings;
}

const STORAGE_KEY = 'wornways-adjustments';

/** The adjustments made on an earlier visit; none when there are none or storage is off. */
export function loadAdjustments(): Adjustments {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown;
    return stored && typeof stored === 'object' ? fromEarlierVersions(stored as Adjustments) : {};
  } catch {
    return {};
  }
}
/** Marks adjustments saved by the app with its five steps. */
const SAVED_WITH = 'saved-with';
const FIVE_STEPS = 'five-steps';
const SEPARATE_PLAYBACK = 'separate-playback';

/**
 * Older drafts share playback settings across selection sizes. Copy those values into
 * both sets to preserve how each one plays.
 */
export function fromEarlierVersions(adjustments: Adjustments): Adjustments {
  if (adjustments[SAVED_WITH] === SEPARATE_PLAYBACK) return adjustments;
  const migrated: Adjustments = { ...adjustments, [SAVED_WITH]: SEPARATE_PLAYBACK };
  if (adjustments[SAVED_WITH] !== FIVE_STEPS) {
    delete migrated['preset-one'];
    delete migrated.preset;
  }
  for (const name of PLAYBACK_SETTINGS)
    if (adjustments[name] !== undefined) migrated[adjustmentKey(name, 'one')] = adjustments[name];
  return migrated;
}
export function saveAdjustments(adjustments: Adjustments): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(adjustments));
  } catch {
    // Without storage the adjustments last until the page is closed.
  }
}
