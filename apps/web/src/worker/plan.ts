// How a video will be paced, worked out without drawing anything: for the Video step,
// which tells what the chosen settings will actually play.

import {
  parseSettings,
  planReplay,
  selectTracks,
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
    seconds: plan.timeline.duration,
    groups: plan.groups ?? null,
    realPace: settings.groupPace === 'real',
    overlap: settings.overlap,
  };
}
