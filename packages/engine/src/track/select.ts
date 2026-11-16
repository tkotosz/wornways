// Choosing the activities a replay shows, and cleaning their tracks.

import type { RenderSettings } from '../replay/settings.ts';
import { cleanTrack, paceByDistance, trackLengthM, trimEdgeJumps } from './clean.ts';
import { distanceFrom } from './places.ts';
import { pointCount, type Track } from './types.ts';

/** A track shorter than this on the map is left out: it is invisible at any useful zoom. */
export const MIN_LENGTH_M = 200;

/**
 * Whether the settings include activities of this sport: every sport when none is named.
 * That includes virtual activities, whose positions lie in a game's world (some at real
 * cities, some in the ocean), which can widen the map to the whole world.
 */
export function sportIncluded(settings: Pick<RenderSettings, 'sports'>, sport: string): boolean {
  return settings.sports ? settings.sports.includes(sport) : true;
}

/** Why a selection has no tracks. */
export type SelectionProblem = 'nothing-matches' | 'nothing-near' | 'nothing-usable';

/** What the place filters ask for, in words, e.g. "starts near the chosen place". */
export function nearPlacesText(settings: Pick<RenderSettings, 'startNear' | 'endNear'>): string {
  if (settings.startNear && settings.endNear) return 'starts and ends near the chosen places';
  return settings.startNear ? 'starts near the chosen place' : 'ends near the chosen place';
}

/** The activities the settings choose, before their tracks are cleaned. */
export type Match = {
  /** The activities that pass every filter, in the order they were given. */
  kept: Track[];
  /** Why nothing is kept; null when something is. */
  problem: 'nothing-matches' | 'nothing-near' | null;
  /** The activities of the chosen ids, sports and period, before the place filters. */
  matched: Track[];
  /**
   * The matched activities the place filters left out, with how far from the start place
   * they start and from the end place they end, in meters, where that was the reason.
   */
  farAway: { track: Track; startsAwayM: number | null; endsAwayM: number | null }[];
};

/** The tracks a replay shows, and what happened to the activities on the way there. */
export type Selection = Omit<Match, 'kept' | 'problem'> & {
  /** The cleaned tracks, in date order. Empty when `problem` is set. */
  tracks: Track[];
  /** Why there are no tracks; null when there are. */
  problem: SelectionProblem | null;
  /** How many matched activities the place filters kept. */
  nearPlaces: number;
  /** Activities that lost points at the start or the end to a GPS jump, and how many. */
  trimmed: { track: Track; start: number; end: number }[];
  /** Activities left out for being shorter than `MIN_LENGTH_M`. */
  tooShort: Track[];
  /** Points of the kept activities before cleaning, and of the tracks after it. */
  rawPoints: number;
  keptPoints: number;
};

/**
 * The activities the settings choose: the activity ids, sports and period, then the place
 * filters (starts near, ends near). Quick, because tracks are not cleaned; `selectTracks` does that.
 */
export function matchActivities(activities: Track[], settings: RenderSettings): Match {
  const from = settings.from ?? -Infinity;
  const to = settings.to ?? Infinity;
  const matched = activities.filter(
    (t) =>
      (settings.activities === null || settings.activities.includes(t.id)) &&
      sportIncluded(settings, t.sport) &&
      t.startTime >= from &&
      t.startTime < to,
  );
  const match: Match = { kept: matched, problem: null, matched, farAway: [] };
  if (matched.length === 0) return { ...match, kept: [], problem: 'nothing-matches' };

  const { startNear, endNear } = settings;
  if (!startNear && !endNear) return match;
  match.kept = [];
  for (const track of matched) {
    const starts = startNear ? distanceFrom(track, 'start', startNear.place) : 0;
    const ends = endNear ? distanceFrom(track, 'end', endNear.place) : 0;
    const startsAway = startNear !== null && starts > startNear.radius;
    const endsAway = endNear !== null && ends > endNear.radius;
    if (!startsAway && !endsAway) match.kept.push(track);
    else
      match.farAway.push({
        track,
        startsAwayM: startsAway ? starts : null,
        endsAwayM: endsAway ? ends : null,
      });
  }
  if (match.kept.length === 0) match.problem = 'nothing-near';
  return match;
}

/**
 * Picks the activities the settings ask for (see `matchActivities`), cleans their tracks
 * and applies the pace setting.
 */
export function selectTracks(activities: Track[], settings: RenderSettings): Selection {
  const { kept, problem, ...match } = matchActivities(activities, settings);
  const selection: Selection = {
    ...match,
    tracks: [],
    problem,
    nearPlaces: kept.length,
    trimmed: [],
    tooShort: [],
    rawPoints: 0,
    keptPoints: 0,
  };
  if (problem) return selection;

  selection.rawPoints = kept.reduce((n, t) => n + pointCount(t), 0);
  const cleaned: Track[] = [];
  for (const t of kept) {
    const trim = trimEdgeJumps(t);
    if (trim.start || trim.end)
      selection.trimmed.push({ track: t, start: trim.start, end: trim.end });
    const c = cleanTrack(trim.track, { edgeJumpM: 0 });
    if (c) cleaned.push(c);
  }
  cleaned.sort((a, b) => a.startTime - b.startTime);
  for (const t of cleaned.filter((c) => trackLengthM(c) < MIN_LENGTH_M)) {
    selection.tooShort.push(t);
    cleaned.splice(cleaned.indexOf(t), 1);
  }
  if (settings.pace === 'distance')
    for (let i = 0; i < cleaned.length; i++) cleaned[i] = paceByDistance(cleaned[i]);
  if (cleaned.length === 0) return { ...selection, problem: 'nothing-usable' };

  selection.tracks = cleaned;
  selection.keptPoints = cleaned.reduce((n, t) => n + pointCount(t), 0);
  return selection;
}
