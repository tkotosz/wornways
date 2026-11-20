// Reader for the activity list of a Garmin account export: the `*_summarizedActivities.json`
// files in its DI-Connect-Fitness folder, which give each activity its id, name, type and
// time. The list does not say which file holds an activity, so files are matched by time.

export type GarminEntry = {
  /** "garmin-" and Garmin's activity id, apart from the bare numbers of Strava's ids. */
  id: string;
  name: string;
  /** In the app's own naming (see `GARMIN_SPORTS`), or empty when the type is not known. */
  sport: string;
  /** Epoch milliseconds when the recording started and ended, pauses included. */
  start: number;
  end: number;
};

/**
 * Garmin's activity types, named the way the rest of the app names sports (Strava's activity
 * types), so that a ride is a "ride" whichever export it comes from. Types not listed take the
 * sport written in the activity file.
 */
const GARMIN_SPORTS: Record<string, string> = {
  cycling: 'ride',
  road_biking: 'ride',
  gravel_cycling: 'gravel-ride',
  mountain_biking: 'mountain-bike-ride',
  e_bike_fitness: 'e-bike-ride',
  e_bike_mountain: 'e-mountain-bike-ride',
  virtual_ride: 'virtual-ride',
  indoor_cycling: 'virtual-ride',
  running: 'run',
  street_running: 'run',
  track_running: 'run',
  trail_running: 'trail-run',
  treadmill_running: 'virtual-run',
  virtual_run: 'virtual-run',
  walking: 'walk',
  casual_walking: 'walk',
  speed_walking: 'walk',
  hiking: 'hike',
  lap_swimming: 'swim',
  open_water_swimming: 'swim',
  resort_skiing: 'alpine-ski',
  resort_skiing_snowboarding_ws: 'alpine-ski',
  resort_snowboarding: 'snowboard',
  backcountry_skiing: 'backcountry-ski',
  cross_country_skiing_ws: 'nordic-ski',
  skate_skiing_ws: 'nordic-ski',
  stand_up_paddleboarding: 'stand-up-paddling',
  stand_up_paddleboarding_v2: 'stand-up-paddling',
  kayaking: 'kayaking',
  kayaking_v2: 'kayaking',
  rowing: 'rowing',
  rowing_v2: 'rowing',
  inline_skating: 'inline-skate',
  sailing: 'sail',
  sailing_v2: 'sail',
};

/** Garmin's activity type in the app's own naming, or empty when unknown. */
export const garminSport = (type: string): string => GARMIN_SPORTS[type] ?? '';

/** Whether a path is one of the activity list files of a Garmin export. */
export const isGarminList = (path: string) => /_summarizedActivities\.json$/i.test(path);

type Summary = {
  activityId?: number;
  name?: string;
  activityType?: string;
  beginTimestamp?: number;
  elapsedDuration?: number;
  duration?: number;
};

/** The activities one list file holds. Throws when the file is not such a list. */
export function parseGarminList(jsonText: string): GarminEntry[] {
  const data: unknown = JSON.parse(jsonText);
  const summaries = Array.isArray(data)
    ? (data as { summarizedActivitiesExport?: unknown }[]).flatMap(
        (part) => part.summarizedActivitiesExport ?? [],
      )
    : [];
  if (!Array.isArray(data) || summaries.some((s) => typeof s !== 'object' || s === null))
    throw new Error('not a Garmin activity list');
  return (summaries as Summary[])
    .filter((s) => typeof s.activityId === 'number' && typeof s.beginTimestamp === 'number')
    .map((s) => {
      // Durations are in milliseconds; the elapsed one includes the pauses.
      const length = s.elapsedDuration ?? s.duration ?? 0;
      return {
        id: `garmin-${s.activityId}`,
        name: s.name ?? '',
        sport: garminSport(s.activityType ?? ''),
        start: s.beginTimestamp!,
        end: s.beginTimestamp! + length,
      };
    });
}

/** A recording may start a little before the list says, and its first position come late. */
const START_SLACK_MS = 60_000;

/**
 * The listed activity a file belongs to: the one whose time span holds the file's first
 * position, the latest-starting one when spans overlap. Null when none does.
 */
export function findGarminEntry(entries: GarminEntry[], startTime: number): GarminEntry | null {
  let found: GarminEntry | null = null;
  for (const entry of entries) {
    if (startTime < entry.start - START_SLACK_MS || startTime > entry.end) continue;
    if (!found || entry.start > found.start) found = entry;
  }
  return found;
}
