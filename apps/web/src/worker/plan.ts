// How a video will be paced, worked out without drawing anything: for the Video step,
// which tells what the chosen settings will actually play.

import {
  STRIDE,
  automaticTitle,
  parseSettings,
  planReplay,
  selectTracks,
  trackLengthM,
  type SettingsInput,
  type Track,
} from '@wornways/engine';
import type { PlanReport } from '../messages.ts';
import { VideoProblem, problemText } from './video.ts';

export function planVideo(library: Track[], input: SettingsInput): PlanReport {
  const settings = parseSettings(input);
  const selection = selectTracks(library, settings);
  if (selection.problem) throw new VideoProblem(problemText(selection.problem, settings));
  const plan = planReplay(selection.tracks, settings);
  return {
    activities: selection.tracks.length,
    meters: selection.tracks.reduce((sum, track) => sum + trackLengthM(track), 0),
    privacyOmitted: selection.privacyOmitted,
    title: automaticTitle(selection.tracks, settings),
    hasElevation: selection.tracks.some((track) =>
      track.points.some((value, index) => index % STRIDE === 2 && Number.isFinite(value)),
    ),
    seconds: plan.timeline.duration,
    groups: plan.groups ?? null,
    realPace: settings.groupPace === 'real',
    follows: settings.camera === 'follow' && plan.timeline.mode !== 'race',
    overlap: settings.overlap,
  };
}
