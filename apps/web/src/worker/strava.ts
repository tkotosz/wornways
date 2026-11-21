import {
  distanceM,
  frequentPlacesAt,
  nearPlacesText,
  parseSettings,
  sportIncluded,
  sportSlug,
  STRIDE,
  type LatLon,
  type RenderSettings,
  type SettingsInput,
  type Track,
  type TrackEnd,
} from '@wornways/engine';
import type { ActivitySummary, MatchReport } from '../messages.ts';
import { clearStravaAccess, type StravaGrant } from '../strava-auth.ts';
import { StravaCache } from './strava-cache.ts';
import { sessionTileLoader } from './tile-cache.ts';

const API = '/api/strava/activities';
const PREFETCH_COUNT = 5;
const TRACK_REQUESTS = 3;
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

type StravaActivity = { summary: ActivitySummary; start?: LatLon; end?: LatLon; version: string };

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

type Streams = {
  latlng?: { data: [number, number][] };
  time?: { data: number[] };
  altitude?: { data: number[] };
};

export class StravaError extends Error {}
export class StravaExpired extends StravaError {}

function coordinates(values: number[] | null | undefined): LatLon | undefined {
  if (values?.length !== 2) return;
  const [lat, lon] = values;
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat!) <= 90 && Math.abs(lon!) <= 180)
    return { lat: lat!, lon: lon! };
}

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

function trackFromStreams(activity: ActivitySummary, streams: Streams): Track | null {
  const positions = streams.latlng?.data;
  const times = streams.time?.data;
  const elevations = streams.altitude?.data;
  if (!positions || !times || positions.length !== times.length) return null;
  const points = new Float64Array(positions.length * STRIDE);
  let size = 0;
  for (const [index, coordinate] of positions.entries()) {
    const point = coordinates(coordinate);
    if (!point || !Number.isFinite(times[index])) continue;
    const { lat, lon } = point;
    points[size++] = lon;
    points[size++] = lat;
    points[size++] = Number.isFinite(elevations?.[index]) ? elevations![index]! : NaN;
    points[size++] = times[index]!;
  }
  if (size < 2 * STRIDE) return null;
  const offset = points[3]!;
  for (let i = 3; i < size; i += STRIDE) points[i] = points[i]! - offset;
  return {
    ...activity,
    points: points.subarray(0, size),
  };
}

/** One replay's Strava activities and temporary browser cache. */
export class StravaSession {
  private readonly lifetime = new AbortController();
  private range = new AbortController();
  private activities = new Map<string, StravaActivity>();
  private tracks = new Map<string, Promise<Track | null>>();
  private limited = false;
  private preparing = false;
  private prefetching = false;
  private ahead: string[] = [];
  private readonly browserCache: StravaCache<StravaActivity>;

  readonly loadTiles = sessionTileLoader(this.signal);

  constructor(private readonly grant: StravaGrant) {
    this.browserCache = new StravaCache(grant.sessionId, grant.expiresAt, grant.cacheKey);
  }

  get signal(): AbortSignal {
    return this.lifetime.signal;
  }

  close(): Promise<unknown> {
    this.lifetime.abort();
    this.activities.clear();
    this.tracks.clear();
    this.ahead = [];
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
    this.range.abort();
    this.range = new AbortController();
    this.activities.clear();
    this.tracks = new Map();
    this.ahead = [];
    const range = this.range.signal;
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
      if (batch.length === 0) break;
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
    const ordered = [...rows.values()]
      .map((row) => row.summary)
      .sort((a, b) => b.startTime - a.startTime);
    this.activities = rows;
    this.prioritize(ordered.slice(0, PREFETCH_COUNT).map((row) => row.id));
    return ordered;
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
        : 'No Strava activity ' + nearPlacesText(settings) + '.';
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
          // A new date range can replace this queue while an old request is in flight.
          if (range === this.range.signal) return;
        }
      }
    } finally {
      this.prefetching = false;
    }
  }

  async prepare(ids: string[], signal: AbortSignal): Promise<string[]> {
    const unavailable: string[] = [];
    const active = AbortSignal.any([signal, this.signal, this.range.signal]);
    let next = 0;
    this.preparing = true;
    let stopped = false;
    const fetchTracks = async () => {
      while (!active.aborted && !stopped && next < ids.length) {
        const id = ids[next++]!;
        try {
          if (!(await this.load(id))) unavailable.push(id);
        } catch (error) {
          stopped = true;
          throw error;
        }
      }
    };
    try {
      const results = await Promise.allSettled(
        Array.from({ length: Math.min(ids.length, TRACK_REQUESTS) }, fetchTracks),
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

  private async loadTrack(row: StravaActivity, signal: AbortSignal): Promise<Track | null> {
    const cached = await this.browserCache.track(row.summary.id, row.version);
    signal.throwIfAborted();
    if (cached) return { ...cached, ...row.summary };

    const res = await this.get(new URLSearchParams({ activity: row.summary.id }), signal, true);
    const track =
      res.status === 404 ? null : trackFromStreams(row.summary, (await res.json()) as Streams);
    signal.throwIfAborted();
    if (track) await this.browserCache.saveTrack(track, row.version);
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
      this.limited = true;
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
