// How a video will be paced, worked out without drawing anything: for the Video step,
// which tells what the chosen settings will actually play.

import {
  SENSOR_CHANNELS,
  STRIDE,
  automaticTitle,
  recorded,
  parseSettings,
  planReplay,
  selectTracks,
  trackLengthM,
  type SettingsInput,
  type Track,
} from '@wornways/engine';
import type { PlanReport } from '../messages.ts';
import { VideoProblem, problemText } from './video.ts';

/**
 * The plan for a video of these activities. `caloriesOnRequest`: the calories can be fetched
 * when a video shows them (Strava), so they are offered before any is known.
 */
export function planVideo(
  library: Track[],
  input: SettingsInput,
  caloriesOnRequest = false,
): PlanReport {
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
    sensors: SENSOR_CHANNELS.filter((channel) =>
      selection.tracks.some((track) => recorded(track.sensors, channel)),
    ),
    hasCalories:
      caloriesOnRequest || selection.tracks.some((track) => track.calories !== undefined),
    seconds: plan.timeline.duration,
    groups: plan.groups ?? null,
    realPace: settings.groupPace === 'real',
    follows: plan.camera === 'follow',
    followTooShort:
      settings.camera === 'follow' && plan.camera !== 'follow' && plan.timeline.mode !== 'race',
    overlap: settings.overlap,
  };
}
