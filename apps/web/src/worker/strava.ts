import { sportSlug, type SettingsInput, type Track, type TrackEnd } from '@wornways/engine';
import type { ActivitySummary, MatchReport, Progress } from '../messages.ts';
import { clearStravaAccess, type StravaGrant } from '../strava-auth.ts';
import { RemoteActivities, type RemoteActivity } from './remote-activities.ts';
import { StravaCache } from './strava-cache.ts';
import { coordinates, trackFromStreams, type Streams } from './strava-track.ts';
import { sessionTileLoader } from './tile-cache.ts';

const API = '/api/strava/activities';
const TRACK_REQUESTS = 3;
/** Activities per page of the list, as functions/api/strava/activities.ts asks Strava for. */
const PAGE_SIZE = 100;
const textEncoder = new TextEncoder();

type Summary = {
  id: number;
  id_str?: string;
  name: string;
  sport_type?: string;
  type?: string;
  start_date: string;
  distance: number;
  start_latlng?: number[] | null;
  end_latlng?: number[] | null;
  elapsed_time?: number;
  visibility?: string;
  private?: boolean;
  map?: { summary_polyline?: string };
};

type StravaActivity = RemoteActivity;

async function routeVersion(data: Summary): Promise<string> {
  const details = JSON.stringify([
    data.start_date,
    data.distance,
    data.elapsed_time,
    data.start_latlng,
    data.end_latlng,
    data.visibility,
    data.private,
    data.map?.summary_polyline,
  ]);
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(details));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class StravaError extends Error {}
export class StravaExpired extends StravaError {}

async function summary(data: Summary): Promise<StravaActivity | null> {
  const id = data.id_str ?? (Number.isSafeInteger(data.id) ? String(data.id) : '');
  const startTime = Date.parse(data.start_date);
  if (!/^\d+$/.test(id) || !Number.isFinite(startTime)) return null;
  return {
    summary: {
      id,
      name: data.name || 'Strava activity',
      sport: sportSlug(data.sport_type || data.type || '') || 'unknown',
      startTime,
      distanceM: Number.isFinite(data.distance) ? data.distance : 0,
    },
    start: coordinates(data.start_latlng),
    end: coordinates(data.end_latlng),
    version: await routeVersion(data),
  };
}

/** One replay's Strava activities and temporary browser cache. */
export class StravaSession {
  private readonly lifetime = new AbortController();
  private readonly activities: RemoteActivities;
  private readonly browserCache: StravaCache<StravaActivity>;
  /** Calories fetched this session, null where Strava has none. */
  private readonly caloriesById = new Map<string, number | null>();

  readonly loadTiles = sessionTileLoader(this.signal);

  constructor(private readonly grant: StravaGrant) {
    this.browserCache = new StravaCache(grant.sessionId, grant.expiresAt, grant.cacheKey);
    this.activities = new RemoteActivities('Strava', this.signal, (row, signal) =>
      this.loadTrack(row, signal),
    );
  }

  get signal(): AbortSignal {
    return this.lifetime.signal;
  }

  /** Stops its requests; the browser cache stays for when Strava is opened again. */
  pause(): void {
    this.lifetime.abort();
    this.activities.clear();
  }

  close(): Promise<unknown> {
    this.lifetime.abort();
    this.activities.clear();
    return this.browserCache.clear();
  }

  async end(disconnect: boolean): Promise<void> {
    try {
      await Promise.all([this.close(), clearStravaAccess(this.grant.sessionId, disconnect)]);
    } catch {
      throw new StravaError(
        disconnect
          ? 'Strava could not disconnect the app. You can revoke access in Strava settings.'
          : 'Could not clear the Strava sign-in. Try again when online.',
      );
    }
  }

  async list(
    from: number | null,
    to: number | null,
    signal: AbortSignal,
    activityChanged: boolean,
  ): Promise<ActivitySummary[]> {
    const range = this.activities.startList();
    const active = AbortSignal.any([this.signal, range, signal]);
    if (activityChanged) await this.browserCache.clear();
    active.throwIfAborted();
    if (from === null || to === null) return [];
    const previous = await this.browserCache.list();
    active.throwIfAborted();
    const rows = new Map<string, StravaActivity>();
    const parameters = new URLSearchParams({
      after: String(Math.floor(from / 1000) - 1),
      before: String(Math.ceil(to / 1000)),
    });

    for (let page = 1; ; page++) {
      parameters.set('page', String(page));
      const res = await this.get(parameters, active);
      const batch = (await res.json()) as Summary[];
      active.throwIfAborted();
      for (const row of await Promise.all(batch.map(summary))) {
        if (row && from <= row.summary.startTime && row.summary.startTime < to)
          rows.set(row.summary.id, row);
      }
      // A page shorter than a full one is the last: no need to ask for an empty one.
      if (batch.length < PAGE_SIZE) break;
    }

    active.throwIfAborted();
    if (previous) {
      const invalid = previous.filter(
        ({ summary, version }) =>
          summary.startTime >= from &&
          summary.startTime < to &&
          rows.get(summary.id)?.version !== version,
      );
      await Promise.all(invalid.map((row) => this.browserCache.clearTrack(row.summary.id)));
      active.throwIfAborted();
    }
    await this.browserCache.saveList([...rows.values()]);
    active.throwIfAborted();
    return this.activities.setList([...rows.values()]);
  }

  match(input: SettingsInput): MatchReport {
    return this.activities.match(input);
  }

  places(input: SettingsInput, end: TrackEnd) {
    return this.activities.places(input, end);
  }

  prioritize(ids: string[]): void {
    this.activities.prioritize(ids);
  }

  prepare(ids: string[], signal: AbortSignal, onProgress: (p: Progress) => void) {
    return this.activities.prepare(ids, signal, TRACK_REQUESTS, (done, total) =>
      onProgress({ stage: 'reading', done, total }),
    );
  }

  selected(ids: string[]): Promise<Track[]> {
    return this.activities.selected(ids);
  }

  /**
   * The tracks with their calories, which only Strava's detailed activity has: one more
   * request per activity, so they are fetched only for a video that shows them, a few at a
   * time, and kept like the tracks. A track Strava has no calories for stays without.
   */
  async withCalories(tracks: Track[], signal: AbortSignal): Promise<Track[]> {
    const out = [...tracks];
    let next = 0;
    const worker = async () => {
      while (next < out.length) {
        const index = next++;
        const track = out[index]!;
        if (track.calories !== undefined) continue;
        const calories = await this.calories(track.id, signal);
        if (calories !== null) out[index] = { ...track, calories };
      }
    };
    try {
      await Promise.all(Array.from({ length: TRACK_REQUESTS }, worker));
    } catch (error) {
      if (error instanceof StravaError && !(error instanceof StravaExpired) && !signal.aborted)
        throw new StravaError(
          `${error.message} Calories take one more request per activity; leave them out to make the video now.`,
        );
      throw error;
    }
    return out;
  }

  private async calories(id: string, signal: AbortSignal): Promise<number | null> {
    const known = this.caloriesById.get(id);
    if (known !== undefined) return known;
    const version = this.activities.row(id)?.version ?? '';
    let calories = await this.browserCache.calories(id, version);
    signal.throwIfAborted();
    if (calories === undefined) {
      const res = await this.get(new URLSearchParams({ calories: id }), signal, true);
      const body = res.status === 404 ? null : ((await res.json()) as { calories?: unknown });
      calories = typeof body?.calories === 'number' ? body.calories : null;
      signal.throwIfAborted();
      await this.browserCache.saveCalories(id, version, calories);
    }
    this.caloriesById.set(id, calories);
    return calories;
  }

  /** The activities whose tracks this device keeps for the session, newest first. */
  async downloaded(): Promise<ActivitySummary[]> {
    const list = await this.browserCache.downloaded();
    return list.sort((a, b) => b.startTime - a.startTime);
  }

  /** Deletes kept tracks; they are fetched again when a video needs them. */
  async forget(ids: string[] | 'all'): Promise<void> {
    const all = ids === 'all' ? (await this.browserCache.downloaded()).map((row) => row.id) : ids;
    this.activities.forget(all);
    await Promise.all(all.map((id) => this.browserCache.clearTrack(id)));
  }

  private async loadTrack(row: StravaActivity, signal: AbortSignal): Promise<Track | null> {
    const cached = await this.browserCache.track(row.summary.id, row.version);
    signal.throwIfAborted();
    if (cached) {
      // Tracks cached before the index existed are listed once they are used.
      await this.browserCache.noteTrack(row.summary);
      return { ...cached, ...row.summary };
    }

    const res = await this.get(new URLSearchParams({ activity: row.summary.id }), signal, true);
    const track =
      res.status === 404 ? null : trackFromStreams(row.summary, (await res.json()) as Streams);
    signal.throwIfAborted();
    if (track) await this.browserCache.saveTrack(track, row.version, row.summary);
    signal.throwIfAborted();
    return track;
  }

  private async get(
    query: URLSearchParams,
    signal: AbortSignal,
    allowMissing = false,
  ): Promise<Response> {
    signal.throwIfAborted();
    if (this.grant.expiresAt <= Date.now())
      throw new StravaExpired('Your Strava session expired before this request. Connect again.');
    const res = await fetch(`${API}?${query}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
      headers: { 'X-Wornways-Strava-Session': this.grant.sessionId },
      signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    }).catch((error: unknown) => {
      if (signal.aborted) throw error;
      throw new StravaError('Could not reach Strava. Check your connection and try again.');
    });
    if (res.status === 429) {
      this.activities.limited = true;
      throw new StravaError('Strava’s request limit was reached. Try again in a few minutes.');
    }
    if (res.status === 401)
      throw new StravaExpired(
        res.headers.get('X-Wornways-Strava-Reason') === 'strava-rejected'
          ? 'Strava rejected the access token. Connect again.'
          : 'Your Strava session cookie is missing or was replaced. Connect again.',
      );
    if (!res.ok && !(allowMissing && res.status === 404))
      throw new StravaError('Strava could not load your activities. Try again.');
    return res;
  }
}
