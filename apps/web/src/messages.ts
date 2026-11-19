// Every message between the page and the worker. The page sends requests, each with an id;
// the worker answers each request with exactly one final reply carrying the same id, and
// may send progress for it before that.

import type { FrequentPlace, Grouping, SettingsInput, TrackEnd } from '@wornways/engine';

import type { StravaGrant } from './strava-auth.ts';

export type Request =
  | { type: 'read-library'; id: number }
  | { type: 'add-files'; id: number; files: File[] }
  /** Deletes the activities with these ids, or every activity. */
  | { type: 'delete-activities'; id: number; ids: string[] | 'all' }
  | { type: 'strava-start'; id: number; grant: StravaGrant }
  | { type: 'strava-list'; id: number; from: number | null; to: number | null }
  | { type: 'strava-prepare'; id: number; ids: string[] }
  | { type: 'strava-prioritize'; id: number; ids: string[] }
  | { type: 'strava-end'; id: number; disconnect: boolean }
  /** Which activities the "Which activities" settings choose. */
  | { type: 'match'; id: number; settings: SettingsInput; strava: boolean }
  /** The places most of the activities these settings choose start or end at, to suggest. */
  | { type: 'places'; id: number; settings: SettingsInput; end: TrackEnd; strava: boolean }
  | { type: 'make-video'; id: number; settings: SettingsInput; strava: boolean }
  /** The last frame of the video the settings describe, small, as a preview. */
  | { type: 'make-poster'; id: number; settings: SettingsInput; strava: boolean }
  /** How the video the settings describe will be paced, without drawing it. */
  | { type: 'plan'; id: number; settings: SettingsInput; strava: boolean }
  /** Stops the request with the given id; that request then replies "canceled". */
  | { type: 'cancel'; id: number };

export type Reply =
  | { type: 'library'; id: number; activities: ActivitySummary[] }
  | { type: 'files-added'; id: number; report: ImportReport; activities: ActivitySummary[] }
  | { type: 'matched'; id: number; match: MatchReport }
  | { type: 'places'; id: number; places: FrequentPlace[] }
  | { type: 'progress'; id: number; progress: Progress }
  | { type: 'video-made'; id: number; video: ArrayBuffer; report: VideoReport }
  | { type: 'poster-made'; id: number; image: Blob }
  | { type: 'planned'; id: number; plan: PlanReport }
  | { type: 'strava-started' | 'strava-ended'; id: number }
  | { type: 'strava-listed'; id: number; activities: ActivitySummary[] }
  | { type: 'strava-prepared'; id: number; unavailable: string[] }
  | { type: 'strava-prioritized'; id: number }
  | { type: 'failed'; id: number; message: string; expired?: boolean }
  | { type: 'canceled'; id: number };

/** Which activities the filters match. */
export type MatchReport = {
  /** The matching activities, newest first. */
  ids: string[];
  /** Why nothing matches; null when something does. */
  problem: string | null;
};

/** What the page shows of an activity; the points stay in the worker. */
export type ActivitySummary = {
  id: string;
  name: string;
  sport: string;
  /** Epoch milliseconds. */
  startTime: number;
  distanceM: number;
};

/** What happened to the files of one "add files" request. */
export type ImportReport = {
  /** Activities added to the library. */
  added: number;
  /** Activities that were in the library already. */
  alreadyThere: number;
  /** Of those, the ones whose name or sport the export's activity list changed. */
  renamed: number;
  /** Files with an activity but no positions, such as an indoor workout. */
  withoutGps: string[];
  /** Files that could not be read, and why. */
  unreadable: { file: string; reason: string }[];
  /** Files that are not activities, such as the photos of an export. */
  ignored: number;
};

/** Where a long task is. `done` and `total` count files while reading, frames while drawing. */
export type Progress = {
  stage: 'reading' | 'storing' | 'choosing' | 'map' | 'drawing' | 'finishing';
  done?: number;
  total?: number;
};

/** How a video will be paced. */
export type PlanReport = {
  activities: number;
  /** The replay's length in seconds, without the end card. */
  seconds: number;
  /**
   * The groups: how many, what each covers, how long, and whether it is one race of every
   * activity; null for a single activity.
   */
  groups: {
    count: number;
    unit: Grouping;
    shortest: number;
    longest: number;
    race: boolean;
  } | null;
  /** Whether a group's activities move at their real pace rather than finishing together. */
  realPace: boolean;
  /** Whether the camera follows the activities in each group in turn. */
  follows: boolean;
  /** How much of a group's time, in percent, the next group starts early. */
  overlap: number;
};

export type VideoReport = {
  fileName: string;
  activities: number;
  seconds: number;
  width: number;
  height: number;
  /** Why the map could not be drawn; null when it was, or when the settings leave it out. */
  mapError: string | null;
};
