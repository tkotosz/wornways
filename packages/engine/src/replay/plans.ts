// Pacing rules: how long a video is and when each activity plays.

import { trackLengthM } from '../track/clean.ts';
import { chronologicalTimeline, groupTimeline, raceTimeline, type Timeline } from './timeline.ts';
import type { Track } from '../track/types.ts';
import type { RenderSettings } from './settings.ts';

export type Plan = {
  timeline: Timeline;
  /** The pacing in words, e.g. "12 months at 2.26 s each". */
  note: string;
  /**
   * The groups it settled on: how many, what each covers, how long, and whether it is one
   * race of every activity at real pace. None for a single activity.
   */
  groups?: { count: number; unit: Grouping; shortest: number; longest: number; race: boolean };
};

export const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
export const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

/** "3–9 Aug 2026", "28 Jul – 3 Aug 2026" or "28 Dec 2025 – 3 Jan 2026". */
export function dateRange(a: number, b: number): string {
  const [da, db] = [new Date(a), new Date(b)];
  const mon = (d: Date) => d.toLocaleString('en-GB', { month: 'short' });
  if (da.getFullYear() !== db.getFullYear())
    return `${dayFormat.format(da)} – ${dayFormat.format(db)}`;
  if (da.getMonth() !== db.getMonth())
    return `${da.getDate()} ${mon(da)} – ${db.getDate()} ${mon(db)} ${db.getFullYear()}`;
  if (da.getDate() === db.getDate()) return dayFormat.format(da);
  return `${da.getDate()}–${db.getDate()} ${mon(db)} ${db.getFullYear()}`;
}

const LEAD_S = 0.4;
const HOLD_S = 2.5;
/**
 * The finished picture holds this briefly when the end card follows: the card fades in
 * from it, so a longer hold looks like the video stopped.
 */
const HOLD_BEFORE_END_CARD_S = 0.3;
/** Automatic grouping takes the finest grouping that gives every group at least this long. */
const SHORTEST_AUTO_GROUP_S = 1.5;

/** What one group covers: an activity, a calendar day, week or month, or every activity. */
export type Grouping = 'activity' | 'day' | 'week' | 'month' | 'all';
/** The groupings automatic grouping tries, the finest first. */
const AUTO_GROUPINGS: readonly Grouping[] = ['activity', 'day', 'week', 'month'];

/** Monday of the week `ms` falls in, at midnight, local time. */
function mondayOf(ms: number): Date {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
}

/** Track indexes in groups: one per activity, per calendar day, week or month, or one. */
function groupTracks(tracks: Track[], grouping: Grouping): number[][] {
  const key = (t: Track, k: number) => {
    const d = new Date(t.startTime);
    if (grouping === 'all') return 'all';
    if (grouping === 'activity') return String(k);
    if (grouping === 'week') return mondayOf(t.startTime).toDateString();
    if (grouping === 'month') return `${d.getFullYear()}-${d.getMonth()}`;
    return d.toDateString();
  };
  const groups: number[][] = [];
  let lastKey = '';
  tracks.forEach((t, k) => {
    if (key(t, k) !== lastKey) groups.push([]);
    groups[groups.length - 1].push(k);
    lastKey = key(t, k);
  });
  return groups;
}

/** A group's headline: a date, a week's dates, a month, or the dates all activities span. */
function groupLabel(starts: number[], grouping: Grouping): string {
  const firstStart = starts[0];
  if (grouping === 'all') return dateRange(firstStart, starts[starts.length - 1]);
  if (grouping === 'month') return monthFormat.format(firstStart);
  if (grouping === 'week') {
    const monday = mondayOf(firstStart).getTime();
    return dateRange(monday, monday + 6 * 86400000);
  }
  return dayFormat.format(firstStart);
}

/**
 * Activities in date order, group after group with no overlap, filling `duration` exactly.
 * A group is an activity, a calendar day, week or month, or every activity; `auto` takes
 * the finest of the first four that gives every group at least 1.5 s. A group's time is
 * even, or grows with the square root of its distance. Its activities finish together, or
 * move at their real pace; a single group at real pace is a race (see `allAtOncePlan`).
 */
export function groupsPlan(
  tracks: Track[],
  settings: Pick<
    RenderSettings,
    'duration' | 'group' | 'share' | 'groupPace' | 'overlap' | 'endCard'
  > &
    Partial<Pick<RenderSettings, 'camera'>>,
): Plan {
  const { duration } = settings;
  const lead = Math.min(LEAD_S, duration * 0.02);
  const hold = settings.endCard ? HOLD_BEFORE_END_CARD_S : Math.min(HOLD_S, duration * 0.1);
  const build = duration - lead - hold;

  const realSeconds = tracks.map((t) => t.points[t.points.length - 1]);
  let grouping: Grouping = 'month';
  let groups: number[][] = [];
  for (const g of settings.group === 'auto' ? AUTO_GROUPINGS : [settings.group]) {
    grouping = g;
    groups = groupTracks(tracks, g);
    if (build / groups.length >= SHORTEST_AUTO_GROUP_S) break;
  }

  // One group at real pace: a race of every activity on one clock.
  if (groups.length === 1 && settings.groupPace === 'real') {
    const race = allAtOncePlan(tracks, duration, settings.endCard ? hold : undefined);
    const length = race.timeline.duration;
    return {
      ...race,
      groups: { count: 1, unit: grouping, shortest: length, longest: length, race: true },
    };
  }

  const sequential = settings.camera === 'follow';
  const lengths = sequential || settings.share === 'distance' ? tracks.map(trackLengthM) : [];
  const timeline = groupTimeline(
    groups.map((ks) => ({
      tracks: ks,
      label: groupLabel(
        ks.map((k) => tracks[k].startTime),
        grouping,
      ),
      share:
        settings.share === 'distance'
          ? Math.sqrt(
              Math.max(
                100,
                ks.reduce((m, k) => m + lengths[k], 0),
              ),
            )
          : 1,
    })),
    tracks.length,
    {
      duration,
      lead,
      hold,
      realSeconds: !sequential && settings.groupPace === 'real' ? realSeconds : undefined,
      sequentialDistances: sequential ? lengths : undefined,
      overlap: settings.overlap / 100,
    },
  );

  const windows = timeline.windows!;
  const times = groups.map((ks) => {
    const first = windows[ks[0]];
    const last = windows[ks[ks.length - 1]];
    return last.start - first.start + last.duration;
  });
  const shortest = Math.min(...times);
  const longest = Math.max(...times);
  const seconds = (s: number) => Number(s.toFixed(2));
  const each =
    longest - shortest < 0.01
      ? `${seconds(shortest)} s`
      : `${seconds(shortest)}–${seconds(longest)} s`;
  const unit =
    groups.length === 1 ? grouping : grouping === 'activity' ? 'activities' : `${grouping}s`;
  const pace = sequential
    ? ', one activity at a time within each group'
    : settings.groupPace === 'real'
      ? ', each at real pace'
      : '';
  const overlapping = settings.overlap > 0 ? `, overlapping ${settings.overlap}%` : '';
  return {
    timeline,
    note: `${groups.length} ${unit} at ${each} each${pace}${overlapping}`,
    groups: { count: groups.length, unit: grouping, shortest, longest, race: false },
  };
}

/**
 * Every activity starts at the same moment; the video is exactly `durationS` long, ending
 * with `hold` seconds on the finished picture (by default the race timeline's own).
 */
export function allAtOncePlan(tracks: Track[], durationS: number, hold?: number): Plan {
  const realSeconds = tracks.map((t) => t.points[t.points.length - 1]);
  const timeline = raceTimeline(realSeconds, { duration: durationS, hold });
  return { timeline, note: 'one race: every activity at once, on one accelerating clock' };
}

/**
 * One activity at its own pace: 15 s for an hour, 7.5 s more per extra hour, up to 60 s,
 * ending with `hold` seconds on the finished picture.
 */
export function activityPlan(track: Track, maxS: number, hold = HOLD_S): Plan {
  const hours = track.points[track.points.length - 1] / 3600;
  const duration = Math.min(maxS, 60, Math.max(15, 15 + 7.5 * (hours - 1)));
  const timeline = chronologicalTimeline([trackLengthM(track)], { duration, lead: LEAD_S, hold });
  const played = duration - LEAD_S - hold;
  const rate = Math.round((hours * 3600) / played);
  return {
    timeline,
    note: `one activity, ${hours.toFixed(1)} h played in ${played.toFixed(1)} s (${rate}x)`,
  };
}

/**
 * The pacing for the selected tracks, which must be in date order. A selection of exactly
 * one activity plays at that activity's own pace.
 */
export function planReplay(tracks: Track[], settings: RenderSettings): Plan {
  if (tracks.length === 0) throw new Error('No tracks to plan');
  if (tracks.length === 1)
    return activityPlan(
      tracks[0],
      settings.duration,
      settings.endCard ? HOLD_BEFORE_END_CARD_S : HOLD_S,
    );
  return groupsPlan(tracks, settings);
}

/** Whether the period from `from` up to (not including) `to` is exactly one calendar month. */
export function isWholeMonth(from: number, to: number): boolean {
  const a = new Date(from);
  return (
    from === new Date(a.getFullYear(), a.getMonth(), 1).getTime() &&
    to === new Date(a.getFullYear(), a.getMonth() + 1, 1).getTime()
  );
}

/** Whether the period from `from` up to (not including) `to` is exactly one calendar year. */
export function isWholeYear(from: number, to: number): boolean {
  const year = new Date(from).getFullYear();
  return from === new Date(year, 0, 1).getTime() && to === new Date(year + 1, 0, 1).getTime();
}

/**
 * The title used when the settings give none: the activity's name for a single activity,
 * otherwise the period ("October 2026", "2026", "3–9 Aug 2026"). The tracks must be in
 * date order. Empty when a single activity has no name.
 */
export function automaticTitle(
  tracks: Pick<Track, 'name' | 'startTime'>[],
  settings: Pick<RenderSettings, 'from' | 'to'>,
): string {
  if (tracks.length === 0) throw new Error('No tracks to title');
  if (tracks.length === 1) return tracks[0].name ?? '';
  const { from, to } = settings;
  if (from !== null && to !== null) {
    if (isWholeMonth(from, to)) return monthFormat.format(from);
    if (isWholeYear(from, to)) return String(new Date(from).getFullYear());
  }
  return dateRange(
    from ?? tracks[0].startTime,
    to !== null ? to - 1 : tracks[tracks.length - 1].startTime,
  );
}

/** YYYY-MM-DD in local time. */
const isoDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * A file name for the video, e.g. "month-2026-10.mp4", "year-2026.mp4",
 * "activity-<id>.mp4" or "replay-2026-08-01-to-2026-08-14.mp4". The tracks must be in
 * date order.
 */
export function videoFileName(tracks: Track[], settings: RenderSettings): string {
  if (tracks.length === 0) throw new Error('No tracks to name');
  if (settings.trimRadius) return 'replay.mp4';
  if (tracks.length === 1) return `activity-${tracks[0].id}.mp4`;
  const { from, to } = settings;
  if (from !== null && to !== null) {
    if (isWholeMonth(from, to)) return `month-${isoDay(from).slice(0, 7)}.mp4`;
    if (isWholeYear(from, to)) return `year-${isoDay(from).slice(0, 4)}.mp4`;
  }
  const first = isoDay(from ?? tracks[0].startTime);
  const last = isoDay(to !== null ? to - 1 : tracks[tracks.length - 1].startTime);
  return `replay-${first}-to-${last}.mp4`;
}
