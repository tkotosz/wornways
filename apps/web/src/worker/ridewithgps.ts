// The connected Ride with GPS account's trips while Ride with GPS is the source. The trip
// list has no date filter, so it is read whole once, and the filters work on it here;
// tracks are fetched only when needed (see remote-activities.ts) and kept until disconnect
// (see ridewithgps-cache.ts). Requests go through this site's Functions, which hold the
// token (functions/api/ridewithgps).

import type { SettingsInput, Track, TrackEnd } from '@wornways/engine';
import type { TripPage } from '../../../../functions/api/ridewithgps/trips.ts';
import type { ActivitySummary, MatchReport, Progress } from '../messages.ts';
import { RemoteActivities, type RemoteActivity } from './remote-activities.ts';
import {
  cachedTrack,
  cacheTrack,
  clearCachedTracks,
  keepCachedTracks,
} from './ridewithgps-cache.ts';
import { listedTrip, trackFromTrip, tripId, type TripPoint } from './ridewithgps-trip.ts';
import { sessionTileLoader } from './tile-cache.ts';

const API = '/api/ridewithgps/trips';
/** Tracks fetched at the same time. */
const TRACK_REQUESTS = 3;
/** An account with more pages than this is not read further; 200 trips each. */
const MAX_PAGES = 100;

export class RideWithGpsError extends Error {}
/** The connection ended: the cookie expired, or access was revoked at Ride with GPS. */
export class RideWithGpsDisconnected extends RideWithGpsError {}

export class RideWithGpsSession {
  private readonly lifetime = new AbortController();
  private readonly trips: RemoteActivities;

  readonly loadTiles = sessionTileLoader(this.signal);

  constructor() {
    this.trips = new RemoteActivities('Ride with GPS', this.signal, (row, signal) =>
      this.loadTrack(row, signal),
    );
  }

  get signal(): AbortSignal {
    return this.lifetime.signal;
  }

  close(): void {
    this.lifetime.abort();
    this.trips.clear();
  }

  /** The account's trips that have a route, newest first. */
  async list(signal: AbortSignal): Promise<ActivitySummary[]> {
    const range = this.trips.startList();
    const active = AbortSignal.any([this.signal, range, signal]);
    const rows: RemoteActivity[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await this.get(new URLSearchParams({ page: String(page) }), active);
      if (!res.ok)
        throw new RideWithGpsError('Ride with GPS could not list your trips. Try again.');
      const { trips, pages } = (await res.json()) as TripPage;
      for (const row of trips) {
        const trip = listedTrip(row);
        if (trip) rows.push(trip);
      }
      if (trips.length === 0 || page >= pages) break;
    }
    active.throwIfAborted();
    // Tracks of trips deleted on Ride with GPS go.
    await keepCachedTracks(new Set(rows.map((row) => row.summary.id)));
    active.throwIfAborted();
    return this.trips.setList(rows);
  }

  match(input: SettingsInput): MatchReport {
    return this.trips.match(input);
  }

  places(input: SettingsInput, end: TrackEnd) {
    return this.trips.places(input, end);
  }

  prioritize(ids: string[]): void {
    this.trips.prioritize(ids);
  }

  /** Fetches the tracks still missing; returns the ids of trips without a usable one. */
  prepare(ids: string[], signal: AbortSignal, onProgress: (p: Progress) => void) {
    return this.trips.prepare(ids, signal, TRACK_REQUESTS, (done, total) =>
      onProgress({ stage: 'reading', done, total }),
    );
  }

  selected(ids: string[]): Promise<Track[]> {
    return this.trips.selected(ids);
  }

  private async loadTrack(row: RemoteActivity, signal: AbortSignal): Promise<Track | null> {
    const cached = await cachedTrack(row.summary.id, row.version);
    signal.throwIfAborted();
    if (cached) return { ...row.summary, ...cached };

    const res = await this.get(new URLSearchParams({ trip: tripId(row.summary.id) }), signal);
    if (res.status === 403 || res.status === 404) return null;
    if (!res.ok) throw new RideWithGpsError('Ride with GPS could not send a trip. Try again.');
    const data = (await res.json()) as { trip?: { track_points?: TripPoint[] } };
    signal.throwIfAborted();
    const track = trackFromTrip(row.summary, data.trip?.track_points ?? []);
    if (track) await cacheTrack(track, row.version);
    return track;
  }

  private async get(query: URLSearchParams, signal: AbortSignal): Promise<Response> {
    signal.throwIfAborted();
    const res = await fetch(`${API}?${query}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    }).catch((error: unknown) => {
      if (signal.aborted) throw error;
      throw new RideWithGpsError('Could not reach Ride with GPS. Check your connection.');
    });
    if (res.status === 401)
      throw new RideWithGpsDisconnected('The Ride with GPS connection ended. Connect again.');
    if (res.status === 429) {
      this.trips.limited = true;
      throw new RideWithGpsError('Ride with GPS asked to slow down. Try again in a few minutes.');
    }
    return res;
  }
}

/** Forgets everything kept of the account, on disconnect or when the connection ended. */
export const forgetRideWithGps = clearCachedTracks;
