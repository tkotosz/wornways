import {
  distanceM,
  frequentPlacesAt,
  garminSport,
  importFiles,
  nearPlacesText,
  parseSettings,
  sportIncluded,
  sportSlug,
  type LatLon,
  type SettingsInput,
  type Track,
  type TrackEnd,
} from '@wornways/engine';
import type { ActivitySummary, MatchReport } from '../messages.ts';
import { sessionTileLoader } from './tile-cache.ts';

const API = '/api/garmin';
const PAGE_SIZE = 99;
const DAY_MS = 86_400_000;
const DOWNLOADS = 3;

type Summary = {
  activityId?: number;
  activityName?: string;
  activityType?: { typeKey?: string };
  startTimeGMT?: string;
  distance?: number;
  startLatitude?: number;
  startLongitude?: number;
  endLatitude?: number;
  endLongitude?: number;
};

type GarminActivity = { summary: ActivitySummary; start?: LatLon; end?: LatLon };

export class GarminError extends Error {}
export class GarminExpired extends GarminError {}

const expired = () => new GarminExpired('Your Garmin Connect session ended. Connect again.');

function point(lat?: number, lon?: number): LatLon | undefined {
  if (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  )
    return { lat, lon };
}

function activity(row: Summary | null): GarminActivity | null {
  const id = row?.activityId;
  const date = row?.startTimeGMT;
  if (!row || !id || id < 0 || !Number.isSafeInteger(id) || typeof date !== 'string') return null;
  const startTime = Date.parse(date.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(startTime)) return null;
  const type = typeof row.activityType?.typeKey === 'string' ? row.activityType.typeKey : '';
  const distance = row.distance;
  return {
    summary: {
      id: String(id),
      name:
        typeof row.activityName === 'string' && row.activityName.trim()
          ? row.activityName
          : 'Garmin activity',
      sport: garminSport(type) || sportSlug(type) || 'unknown',
      startTime,
      distanceM:
        typeof distance === 'number' && Number.isFinite(distance) && distance > 0 ? distance : 0,
    },
    start: point(row.startLatitude, row.startLongitude),
    end: point(row.endLatitude, row.endLongitude),
  };
}

function queryDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

async function request(path: string, signal: AbortSignal, init: RequestInit): Promise<Response> {
  const response = await fetch(API + path, {
    ...init,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(35_000)]),
  }).catch(() => {
    signal.throwIfAborted();
    throw new GarminError('Could not reach Garmin Connect. Check your connection and try again.');
  });
  if (response.status === 429)
    throw new GarminError('Garmin Connect is rate limiting requests. Try again later.');
  return response;
}

/** A personal connection keeps its token, activities and downloads in this worker's memory. */
export class GarminSession {
  private readonly lifetime = new AbortController();
  private period = new AbortController();
  private activities = new Map<string, GarminActivity>();
  private tracks = new Map<string, Track | null>();
  readonly signal = this.lifetime.signal;
  readonly loadTiles = sessionTileLoader(this.signal);

  private constructor(
    private token: string,
    readonly expiresAt: number,
  ) {}

  static async open(key: string, signal: AbortSignal): Promise<GarminSession> {
    const response = await request('', signal, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    if (response.status === 404)
      throw new GarminError('Garmin Connect is unavailable on this deployment.');
    if ([400, 401, 403].includes(response.status))
      throw new GarminError('Garmin Connect did not accept this Personal API key.');
    const grant = response.ok
      ? ((await response.json().catch(() => null)) as {
          token?: unknown;
          expiresAt?: unknown;
        } | null)
      : null;
    const { token, expiresAt } = grant ?? {};
    signal.throwIfAborted();
    if (
      typeof token !== 'string' ||
      !token ||
      typeof expiresAt !== 'number' ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    )
      throw new GarminError('Garmin Connect could not sign in. Try again.');
    return new GarminSession(token, expiresAt);
  }

  close(): void {
    this.lifetime.abort();
    this.token = '';
    this.activities.clear();
    this.tracks.clear();
  }

  async list(
    from: number | null,
    to: number | null,
    signal: AbortSignal,
  ): Promise<ActivitySummary[]> {
    this.check();
    signal.throwIfAborted();
    this.period.abort();
    this.period = new AbortController();
    this.activities.clear();
    this.tracks.clear();
    const active = AbortSignal.any([signal, this.signal, this.period.signal]);
    active.throwIfAborted();
    if (from === null || to === null || to <= from) return [];

    // Garmin searches inclusive activity-local dates. Widen by a day at each end and
    // then apply Wornways' exact period to the GMT timestamp of each activity.
    const query = new URLSearchParams({
      startDate: queryDate(from - DAY_MS),
      endDate: queryDate(to - 1 + DAY_MS),
      limit: String(PAGE_SIZE),
    });
    const found = new Map<string, GarminActivity>();
    for (let start = 0; ; start += PAGE_SIZE) {
      query.set('start', String(start));
      const response = await this.get(query, active);
      const batch: unknown = await response.json().catch(() => null);
      active.throwIfAborted();
      if (!Array.isArray(batch))
        throw new GarminError('Garmin Connect returned an unreadable activity list.');
      for (const raw of batch as (Summary | null)[]) {
        const row = activity(raw);
        if (row && row.summary.startTime >= from && row.summary.startTime < to)
          found.set(row.summary.id, row);
      }
      if (batch.length < PAGE_SIZE) break;
    }
    active.throwIfAborted();
    this.check();
    this.activities = new Map(
      [...found].sort(([, a], [, b]) => b.summary.startTime - a.summary.startTime),
    );
    return [...this.activities.values()].map((row) => row.summary);
  }

  private check(): void {
    if (this.expiresAt <= Date.now()) {
      this.close();
      throw expired();
    }
    this.signal.throwIfAborted();
  }

  private async get(query: URLSearchParams, signal: AbortSignal, allowMissing = false) {
    this.check();
    const response = await request('?' + query, signal, {
      headers: { Authorization: 'Bearer ' + this.token },
    });
    if (response.status === 401 || response.status === 403) {
      this.close();
      throw expired();
    }
    if (!response.ok && !(allowMissing && response.status === 404))
      throw new GarminError('Garmin Connect could not load your activities. Try again.');
    return response;
  }

  private filtered(input: SettingsInput) {
    this.check();
    const settings = parseSettings(input);
    const rows = [...this.activities.values()].filter(
      ({ summary }) =>
        sportIncluded(settings, summary.sport) &&
        (settings.from === null || summary.startTime >= settings.from) &&
        (settings.to === null || summary.startTime < settings.to),
    );
    return { rows, settings };
  }

  match(input: SettingsInput): MatchReport {
    const { rows, settings } = this.filtered(input);
    const within = (point: LatLon | undefined, filter: typeof settings.startNear) =>
      !filter ||
      (point &&
        distanceM(point.lat, point.lon, filter.place.lat, filter.place.lon) <= filter.radius);
    const ids = rows
      .filter((row) => within(row.start, settings.startNear) && within(row.end, settings.endNear))
      .map((row) => row.summary.id);
    return {
      ids,
      problem:
        ids.length || !rows.length || (!settings.startNear && !settings.endNear)
          ? null
          : 'No Garmin activity ' + nearPlacesText(settings) + '.',
    };
  }

  places(input: SettingsInput, end: TrackEnd) {
    const points = this.filtered(input).rows.flatMap((row) => {
      const point = row[end];
      return point ? [{ ...point, time: row.summary.startTime }] : [];
    });
    return frequentPlacesAt(points, 500, 6, 1);
  }

  async prepare(ids: string[], signal: AbortSignal): Promise<string[]> {
    this.check();
    const batch = new AbortController();
    const active = AbortSignal.any([signal, this.signal, this.period.signal, batch.signal]);
    const pending = [...new Set(ids)].filter(
      (id) => !this.tracks.has(id) && this.activities.has(id),
    );
    let next = 0;
    const download = async () => {
      while (!active.aborted && next < pending.length) {
        const id = pending[next++]!;
        const track = await this.load(this.activities.get(id)!.summary, active);
        active.throwIfAborted();
        this.tracks.set(id, track);
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(pending.length, DOWNLOADS) }, download));
      active.throwIfAborted();
      return ids.filter((id) => !this.tracks.get(id));
    } finally {
      batch.abort();
    }
  }

  async selected(ids: string[]): Promise<Track[]> {
    this.check();
    return ids.map((id) => this.tracks.get(id)).filter((track): track is Track => !!track);
  }

  private async load(summary: ActivitySummary, signal: AbortSignal): Promise<Track | null> {
    const response = await this.get(new URLSearchParams({ activity: summary.id }), signal, true);
    if (response.status === 404) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    signal.throwIfAborted();
    const isFit = new TextDecoder().decode(bytes.subarray(8, 12)) === '.FIT';
    const result = await importFiles([
      {
        name: summary.id + (isFit ? '.fit' : '.zip'),
        size: bytes.length,
        read: async (offset, length) => bytes.subarray(offset, offset + length),
      },
    ]);
    const track = result.activities[0];
    return track ? { ...track, id: summary.id, name: summary.name, sport: summary.sport } : null;
  }
}
