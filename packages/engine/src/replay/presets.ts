// Presets: named recipes for how a video plays. A preset gives values to a few settings;
// settings given explicitly win over them, and the others keep their defaults. Some
// presets are meant for several activities, one for a single activity.

/** A preset's name, as the `preset` setting takes it. */
export type Preset = 'recap' | 'all-at-once' | 'multiday-trip' | 'highlight';

export type PresetDefinition = {
  help: string;
  /** Whether the preset is meant for one activity or for several. */
  activities: 'one' | 'several';
  settings: Record<string, string>;
};

export const PRESETS: Record<Preset, PresetDefinition> = {
  'all-at-once': {
    help: 'every activity starts at the same moment and moves at its real pace',
    activities: 'several',
    settings: { group: 'all', 'group-pace': 'real', duration: '30' },
  },
  recap: {
    help: 'activities in turn, grouped as needed (a week by activity, a year by month)',
    activities: 'several',
    settings: { group: 'auto', share: 'even', 'group-pace': 'fit', duration: '30' },
  },
  'multiday-trip': {
    help: 'one day after another, a longer day getting more time, the camera following the route',
    activities: 'several',
    settings: {
      group: 'day',
      share: 'distance',
      'group-pace': 'fit',
      duration: '45',
      camera: 'follow',
    },
  },
  highlight: {
    help: 'for one activity: a 15-second clip, the camera following the route',
    activities: 'one',
    settings: { duration: '15', camera: 'follow' },
  },
};

/** Every preset, in the order they are offered: the first one is the default. */
export const PRESET_NAMES = Object.keys(PRESETS) as Preset[];
