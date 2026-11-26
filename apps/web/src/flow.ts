// The way from a source to the editor: which popup comes next. The app is one screen, the
// editor, and everything else happens in popups over it. A source first needs connecting
// (Strava, Ride with GPS) or files (the files source while it has none); then the activities
// are chosen; then, when the editor is set up for a new kind of selection, the preset.

import { presetChoices, type ActivityCount } from './adjust.ts';
import type { Source } from './messages.ts';

/** The popups that lead to the editor, and the one that makes the video. */
export type Popup = 'source' | 'connect' | 'store' | 'activities' | 'preset' | 'render';

/** Where a source stands when it is picked. */
export interface SourceState {
  /** Strava or Ride with GPS: connected in this browser. */
  connected: boolean;
  /** How many activities the files source holds. */
  files: number;
}

/** What a picked source needs before its activities can be chosen. */
export function afterSource(
  source: Source,
  state: SourceState,
): 'connect' | 'store' | 'activities' {
  if ((source === 'strava' || source === 'rwgps') && !state.connected) return 'connect';
  if (source === 'files' && state.files === 0) return 'store';
  return 'activities';
}

/**
 * Whether the preset is asked after activities are chosen: when the editor was not set up for
 * this kind of selection yet (the first selection since the app opened, or a change between
 * one activity and several), and there is more than one preset to pick from. Choosing more or
 * fewer of the same kind keeps the preset.
 */
export function asksPreset(before: ActivityCount | null, after: ActivityCount): boolean {
  return before !== after && presetChoices(after).length > 1;
}
