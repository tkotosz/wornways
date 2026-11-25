// The page's way to talk to the worker: each method sends one request and returns a
// promise for its reply.

import type { FrequentPlace, SettingsInput, TrackEnd } from '@wornways/engine';
import type {
  ActivitySummary,
  ImportReport,
  MatchReport,
  PlanReport,
  PosterScene,
  Progress,
  Reply,
  Request,
  Source,
  VideoReport,
} from './messages.ts';

import type { StravaGrant } from './strava-auth.ts';

type Pending = {
  resolve: (reply: Reply) => void;
  onProgress?: (progress: Progress) => void;
};

/** The request was canceled before it finished. */
export class Canceled extends Error {}
export class StravaExpired extends Error {}
/** The Ride with GPS connection ended: connect again. */
export class RideWithGpsDisconnected extends Error {}

/** Tracks being downloaded: the ids without a usable track once done, and a way to stop. */
export type Download = { result: Promise<string[]>; cancel: () => void };

/** How far a download is, for the page to show. */
export type DownloadProgress = { done: number; total: number; cancel: () => void };

export class EngineClient {
  private nextId = 1;
  /** Where the activities of the steps after Activities come from. */
  private source: Source = 'files';
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly worker: Worker) {
    worker.onmessage = (event: MessageEvent<Reply>) => {
      const message = event.data;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      if (message.type === 'progress') pending.onProgress?.(message.progress);
      else {
        this.pending.delete(message.id);
        pending.resolve(message);
      }
    };
  }

  /** Every activity in the library, newest first. */
  async readLibrary(): Promise<ActivitySummary[]> {
    const reply = await this.send({ type: 'read-library', id: this.nextId++ });
    if (reply.type === 'library') return reply.activities;
    throw this.errorFor(reply);
  }

  /** Reads activity files, folders' files and export archives into the library. */
  async addFiles(
    files: File[],
    onProgress: (progress: Progress) => void,
  ): Promise<{ report: ImportReport; activities: ActivitySummary[] }> {
    const picked = files.map((file) => ({ file, path: file.webkitRelativePath || file.name }));
    const reply = await this.send(
      { type: 'add-files', id: this.nextId++, files: picked },
      onProgress,
    );
    if (reply.type === 'files-added') return reply;
    throw this.errorFor(reply);
  }

  /** Deletes activities from the library; returns what is left. */
  async deleteActivities(ids: string[] | 'all'): Promise<ActivitySummary[]> {
    const reply = await this.send({ type: 'delete-activities', id: this.nextId++, ids });
    if (reply.type === 'library') return reply.activities;
    throw this.errorFor(reply);
  }

  async startStrava(grant: StravaGrant): Promise<void> {
    const reply = await this.send({ type: 'strava-start', id: this.nextId++, grant });
    if (reply.type !== 'strava-started') throw this.errorFor(reply);
    this.source = 'strava';
  }

  async listStrava(
    from: number | null,
    to: number | null,
    activityChanged = false,
  ): Promise<ActivitySummary[]> {
    const reply = await this.send({
      type: 'strava-list',
      id: this.nextId++,
      from,
      to,
      activityChanged,
    });
    if (reply.type === 'strava-listed') return reply.activities;
    throw this.errorFor(reply);
  }

  /**
   * Fetches the chosen Strava activities' tracks not fetched yet; the result is the ids
   * without one. Canceling keeps the tracks fetched so far.
   */
  prepareStrava(ids: string[], onProgress: (progress: Progress) => void): Download {
    const id = this.nextId++;
    const result = this.send({ type: 'strava-prepare', id, ids }, onProgress).then((reply) => {
      if (reply.type === 'strava-prepared') return reply.unavailable;
      throw this.errorFor(reply);
    });
    return { result, cancel: () => this.cancel(id) };
  }

  prioritizeStrava(ids: string[]): void {
    void this.send({ type: 'strava-prioritize', id: this.nextId++, ids });
  }

  /** Tells the worker of a Strava connection that is not the source, to count what it keeps. */
  async keepStrava(grant: StravaGrant): Promise<void> {
    const reply = await this.send({ type: 'strava-keep', id: this.nextId++, grant });
    if (reply.type !== 'strava-kept') throw this.errorFor(reply);
  }

  /** Stops using Strava as the source; its sign-in and cached tracks stay. */
  async closeStrava(): Promise<void> {
    if (this.source === 'strava') this.source = 'files';
    const reply = await this.send({ type: 'strava-close', id: this.nextId++ });
    if (reply.type !== 'strava-closed') throw this.errorFor(reply);
  }

  async endStrava(disconnect = false): Promise<void> {
    if (this.source === 'strava') this.source = 'files';
    const reply = await this.send({ type: 'strava-end', id: this.nextId++, disconnect });
    if (reply.type !== 'strava-ended') throw this.errorFor(reply);
  }

  /** Opens Ride with GPS as the source; returns the account's trips, newest first. */
  async startRideWithGps(): Promise<ActivitySummary[]> {
    const reply = await this.send({ type: 'rwgps-start', id: this.nextId++ });
    if (reply.type !== 'rwgps-started') throw this.errorFor(reply);
    this.source = 'rwgps';
    return reply.activities;
  }

  /** As prepareStrava, for the chosen Ride with GPS trips. */
  prepareRideWithGps(ids: string[], onProgress: (progress: Progress) => void): Download {
    const id = this.nextId++;
    const result = this.send({ type: 'rwgps-prepare', id, ids }, onProgress).then((reply) => {
      if (reply.type === 'rwgps-prepared') return reply.unavailable;
      throw this.errorFor(reply);
    });
    return { result, cancel: () => this.cancel(id) };
  }

  prioritizeRideWithGps(ids: string[]): void {
    void this.send({ type: 'rwgps-prioritize', id: this.nextId++, ids });
  }

  /** Closes Ride with GPS as the source; `forget` also deletes the tracks kept here. */
  async endRideWithGps(forget = false): Promise<void> {
    if (this.source === 'rwgps') this.source = 'files';
    const reply = await this.send({ type: 'rwgps-end', id: this.nextId++, forget });
    if (reply.type !== 'rwgps-ended') throw this.errorFor(reply);
  }

  /** The activities whose tracks Strava or Ride with GPS keeps on this device, newest first. */
  async downloaded(service: 'strava' | 'rwgps'): Promise<ActivitySummary[]> {
    const reply = await this.send({ type: 'downloaded', id: this.nextId++, service });
    if (reply.type === 'downloaded') return reply.activities;
    throw this.errorFor(reply);
  }

  /** How many tracks Strava or Ride with GPS keeps on this device. */
  async downloadedCount(service: 'strava' | 'rwgps'): Promise<number> {
    const reply = await this.send({ type: 'downloaded-count', id: this.nextId++, service });
    if (reply.type === 'downloaded-count') return reply.count;
    throw this.errorFor(reply);
  }

  /** Deletes kept tracks (they are fetched again when needed); returns what is left. */
  async forgetDownloaded(
    service: 'strava' | 'rwgps',
    ids: string[] | 'all',
  ): Promise<ActivitySummary[]> {
    const reply = await this.send({ type: 'forget-downloaded', id: this.nextId++, service, ids });
    if (reply.type === 'downloaded') return reply.activities;
    throw this.errorFor(reply);
  }

  /** Opens the demo: its activities, held in memory, are the source until it ends. */
  async startDemo(): Promise<ActivitySummary[]> {
    const reply = await this.send({ type: 'demo-start', id: this.nextId++ });
    if (reply.type !== 'demo-started') throw this.errorFor(reply);
    this.source = 'demo';
    return reply.activities;
  }

  async endDemo(): Promise<void> {
    if (this.source === 'demo') this.source = 'files';
    const reply = await this.send({ type: 'demo-end', id: this.nextId++ });
    if (reply.type !== 'demo-ended') throw this.errorFor(reply);
  }

  /** Which of the source's activities the settings choose. */
  async match(settings: SettingsInput, source: Source): Promise<MatchReport> {
    const reply = await this.send({ type: 'match', id: this.nextId++, settings, source });
    if (reply.type === 'matched') return reply.match;
    throw this.errorFor(reply);
  }

  /** The places most of the activities the settings choose start or end at, busiest first. */
  async places(settings: SettingsInput, end: TrackEnd): Promise<FrequentPlace[]> {
    const reply = await this.send({
      type: 'places',
      id: this.nextId++,
      settings,
      end,
      source: this.source,
    });
    if (reply.type === 'places') return reply.places;
    throw this.errorFor(reply);
  }

  /** How the video the settings describe will be paced. */
  async plan(settings: SettingsInput): Promise<PlanReport> {
    const reply = await this.send({
      type: 'plan',
      id: this.nextId++,
      settings,
      source: this.source,
    });
    if (reply.type === 'planned') return reply.plan;
    throw this.errorFor(reply);
  }

  /** Makes a video of the library with the given settings; `cancel` stops it. */
  makeVideo(
    settings: SettingsInput,
    onProgress: (progress: Progress) => void,
    { draft = false } = {},
  ): { result: Promise<{ video: Blob; report: VideoReport }>; cancel: () => void } {
    const id = this.nextId++;
    const result = this.send(
      { type: 'make-video', id, settings, source: this.source, draft },
      onProgress,
    ).then((reply) => {
      if (reply.type === 'video-made')
        return { video: new Blob([reply.video], { type: 'video/mp4' }), report: reply.report };
      throw this.errorFor(reply);
    });
    return {
      result,
      cancel: () => this.worker.postMessage({ type: 'cancel', id } satisfies Request),
    };
  }

  /**
   * Draws a still of the video, small, as a preview: its last frame, or its ending (see
   * `PosterScene`); `cancel` stops it.
   */
  makePoster(
    settings: SettingsInput,
    scene: PosterScene = 'replay',
  ): { result: Promise<Blob>; cancel: () => void } {
    const id = this.nextId++;
    const result = this.send({
      type: 'make-poster',
      id,
      settings,
      source: this.source,
      scene,
    }).then((reply) => {
      if (reply.type === 'poster-made') return reply.image;
      throw this.errorFor(reply);
    });
    return {
      result,
      cancel: () => this.worker.postMessage({ type: 'cancel', id } satisfies Request),
    };
  }

  private send(request: Request, onProgress?: (progress: Progress) => void): Promise<Reply> {
    const reply = new Promise<Reply>((resolve) =>
      this.pending.set(request.id, { resolve, onProgress }),
    );
    this.worker.postMessage(request);
    return reply;
  }

  private cancel(id: number): void {
    this.worker.postMessage({ type: 'cancel', id } satisfies Request);
  }

  private errorFor(reply: Reply): Error {
    if (reply.type === 'canceled') return new Canceled('Canceled');
    if (reply.type === 'failed') {
      if (reply.expired) return new StravaExpired(reply.message);
      if (reply.disconnected) return new RideWithGpsDisconnected(reply.message);
      return new Error(reply.message);
    }
    return new Error(`Unexpected reply: ${reply.type}`);
  }
}
