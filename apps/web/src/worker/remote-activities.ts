// The activities of a connected service (Strava, Ride with GPS) while it is the source: the
// list in memory, the filters over it, and the tracks, fetched only when needed. The newest
// few are fetched ahead, ticked ones move to the front, and leaving the Activities step
// fetches the rest of the chosen ones, a few at a time. Each service says how to fetch one
// track (`TrackLoader`) and fills the list itself.

import {
  distanceM,
  frequentPlacesAt,
  nearPlacesText,
  parseSettings,
  sportIncluded,
  type LatLon,
  type RenderSettings,
  type SettingsInput,
  type Track,
  type TrackEnd,
} from '@wornways/engine';
import type { ActivitySummary, MatchReport } from '../messages.ts';

const PREFETCH_COUNT = 5;

/** The task's result, or an abort error as soon as the signal ends; the task goes on. */
function untilAborted<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason as Error);
  return new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason as Error);
    signal.addEventListener('abort', stop, { once: true });
    task.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

/** One activity of the list. `version` changes whenever its track may have changed. */
export type RemoteActivity = {
  summary: ActivitySummary;
  start?: LatLon;
  end?: LatLon;
  version: string;
};

/** Fetches (or reads from a cache) one activity's track; null when it has no usable route. */
export type TrackLoader = (row: RemoteActivity, signal: AbortSignal) => Promise<Track | null>;

export class RemoteActivities {
  private range = new AbortController();
  private activities = new Map<string, RemoteActivity>();
  private tracks = new Map<string, Promise<Track | null>>();
  private preparing = false;
  private prefetching = false;
  private ahead: string[] = [];
  /** Set when the service asked to slow down: nothing more is fetched ahead. */
  limited = false;

  constructor(
    /** The service's name, for messages: "No <name> activity near …". */
    private readonly service: string,
    /** Ends with the connection: every request stops. */
    private readonly signal: AbortSignal,
    private readonly loadTrack: TrackLoader,
  ) {}

  /** Starts a new list: the old one's tracks and requests go. Its signal ends with the next. */
  startList(): AbortSignal {
    this.range.abort();
    this.range = new AbortController();
    this.activities.clear();
    this.tracks = new Map();
    this.ahead = [];
    return this.range.signal;
  }

  /** The new list, newest first; its newest activities are fetched ahead. */
  setList(rows: RemoteActivity[]): ActivitySummary[] {
    this.activities = new Map(rows.map((row) => [row.summary.id, row]));
    const ordered = rows.map((row) => row.summary).sort((a, b) => b.startTime - a.startTime);
    this.prioritize(ordered.slice(0, PREFETCH_COUNT).map((row) => row.id));
    return ordered;
  }

  clear(): void {
    this.range.abort();
    this.activities.clear();
    this.tracks.clear();
    this.ahead = [];
  }

  private filtered(settings: RenderSettings) {
    return [...this.activities.values()]
      .sort((a, b) => b.summary.startTime - a.summary.startTime)
      .filter(
        ({ summary }) =>
          sportIncluded(settings, summary.sport) &&
          (settings.from === null || summary.startTime >= settings.from) &&
          (settings.to === null || summary.startTime < settings.to),
      );
  }

  match(input: SettingsInput): MatchReport {
    const settings = parseSettings(input);
    const rows = this.filtered(settings);
    const within = (point: LatLon | undefined, filter: RenderSettings['startNear']) =>
      !filter ||
      (point &&
        distanceM(point.lat, point.lon, filter.place.lat, filter.place.lon) <= filter.radius);
    const ids = rows
      .filter((row) => within(row.start, settings.startNear) && within(row.end, settings.endNear))
      .map((row) => row.summary.id);
    const problem =
      ids.length || !rows.length || (!settings.startNear && !settings.endNear)
        ? null
        : `No ${this.service} activity ${nearPlacesText(settings)}.`;
    return { ids, problem };
  }

  places(input: SettingsInput, end: TrackEnd) {
    const points = this.filtered(parseSettings(input)).flatMap((row) => {
      const point = row[end];
      return point ? [{ ...point, time: row.summary.startTime }] : [];
    });
    return frequentPlacesAt(points, 500, 6, 1);
  }

  prioritize(ids: string[]): void {
    this.ahead = [...new Set([...ids, ...this.ahead])]
      .filter((id) => this.activities.has(id) && !this.tracks.has(id))
      .slice(0, PREFETCH_COUNT);
    void this.prefetch();
  }

  private async prefetch(): Promise<void> {
    if (this.prefetching) return;
    this.prefetching = true;
    try {
      while (!this.signal.aborted && !this.limited && !this.preparing && this.ahead.length) {
        const range = this.range.signal;
        try {
          await this.load(this.ahead.shift()!);
        } catch {
          // A new list can replace this queue while an old request is in flight.
          if (range === this.range.signal) return;
        }
      }
    } finally {
      this.prefetching = false;
    }
  }

  /**
   * Fetches the tracks of these activities that are not here yet, `requests` at a time.
   * Returns the ids of those without a usable track. Canceling stops at once; downloads
   * already under way still finish and are kept for next time.
   */
  async prepare(
    ids: string[],
    signal: AbortSignal,
    requests: number,
    onProgress?: (done: number, total: number) => void,
  ): Promise<string[]> {
    const unavailable: string[] = [];
    const active = AbortSignal.any([signal, this.signal, this.range.signal]);
    let next = 0;
    let done = 0;
    this.preparing = true;
    let stopped = false;
    const fetchTracks = async () => {
      while (!active.aborted && !stopped && next < ids.length) {
        const id = ids[next++]!;
        try {
          if (!(await untilAborted(this.load(id), active))) unavailable.push(id);
          onProgress?.(++done, ids.length);
        } catch (error) {
          stopped = true;
          throw error;
        }
      }
    };
    try {
      const results = await Promise.allSettled(
        Array.from({ length: Math.min(ids.length, requests) }, fetchTracks),
      );
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) throw failed.reason;
    } finally {
      this.preparing = false;
      void this.prefetch();
      active.throwIfAborted();
    }
    return unavailable;
  }

  async selected(ids: string[]): Promise<Track[]> {
    const tracks = await Promise.all(ids.map((id) => this.tracks.get(id)));
    this.signal.throwIfAborted();
    return tracks.filter((track): track is Track => !!track);
  }

  private load(id: string): Promise<Track | null> {
    const existing = this.tracks.get(id);
    if (existing) return existing;

    const row = this.activities.get(id);
    if (!row) return Promise.resolve(null);
    const cache = this.tracks;
    const active = AbortSignal.any([this.signal, this.range.signal]);
    const task = this.loadTrack(row, active).catch((error: unknown) => {
      cache.delete(id);
      throw error;
    });
    cache.set(id, task);
    return task;
  }
}
