// The page's way to talk to the worker: each method sends one request and returns a
// promise for its reply.

import type { FrequentPlace, SettingsInput, TrackEnd } from '@wornways/engine';
import type {
  ActivitySource,
  ActivitySummary,
  ImportReport,
  MatchReport,
  PlanReport,
  Progress,
  Reply,
  Request,
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
export class GarminExpired extends Error {}

export class EngineClient {
  private nextId = 1;
  private source: ActivitySource = 'files';
  private garminAttempt = 0;
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
    const reply = await this.send({ type: 'add-files', id: this.nextId++, files }, onProgress);
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

  async prepareStrava(ids: string[]): Promise<string[]> {
    const reply = await this.send({ type: 'strava-prepare', id: this.nextId++, ids });
    if (reply.type === 'strava-prepared') return reply.unavailable;
    throw this.errorFor(reply);
  }

  prioritizeStrava(ids: string[]): void {
    void this.send({ type: 'strava-prioritize', id: this.nextId++, ids });
  }

  async endStrava(disconnect = false): Promise<void> {
    this.source = 'files';
    const reply = await this.send({ type: 'strava-end', id: this.nextId++, disconnect });
    if (reply.type !== 'strava-ended') throw this.errorFor(reply);
  }

  async startGarmin(key: string): Promise<number> {
    const attempt = ++this.garminAttempt;
    const reply = await this.send({ type: 'garmin-start', id: this.nextId++, key });
    if (attempt !== this.garminAttempt) throw new Canceled('Canceled');
    if (reply.type !== 'garmin-started') throw this.errorFor(reply);
    this.source = 'garmin';
    return reply.expiresAt;
  }

  async listGarmin(from: number | null, to: number | null): Promise<ActivitySummary[]> {
    const reply = await this.send({ type: 'garmin-list', id: this.nextId++, from, to });
    if (reply.type === 'garmin-listed') return reply.activities;
    throw this.errorFor(reply);
  }

  async prepareGarmin(ids: string[]): Promise<string[]> {
    const reply = await this.send({ type: 'garmin-prepare', id: this.nextId++, ids });
    if (reply.type === 'garmin-prepared') return reply.unavailable;
    throw this.errorFor(reply);
  }

  async endGarmin(): Promise<void> {
    ++this.garminAttempt;
    if (this.source === 'garmin') this.source = 'files';
    const reply = await this.send({ type: 'garmin-end', id: this.nextId++ });
    if (reply.type !== 'garmin-ended') throw this.errorFor(reply);
  }

  /** Which activities the settings choose. */
  async match(settings: SettingsInput, source: ActivitySource = 'files'): Promise<MatchReport> {
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
  ): { result: Promise<{ video: Blob; report: VideoReport }>; cancel: () => void } {
    const id = this.nextId++;
    const result = this.send(
      { type: 'make-video', id, settings, source: this.source },
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

  /** Draws the last frame of the video, small, as a preview; `cancel` stops it. */
  makePoster(settings: SettingsInput): { result: Promise<Blob>; cancel: () => void } {
    const id = this.nextId++;
    const result = this.send({ type: 'make-poster', id, settings, source: this.source }).then(
      (reply) => {
        if (reply.type === 'poster-made') return reply.image;
        throw this.errorFor(reply);
      },
    );
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

  private errorFor(reply: Reply): Error {
    if (reply.type === 'canceled') return new Canceled('Canceled');
    if (reply.type === 'failed') {
      if (reply.expired === 'strava') return new StravaExpired(reply.message);
      if (reply.expired === 'garmin') return new GarminExpired(reply.message);
      return new Error(reply.message);
    }
    return new Error(`Unexpected reply: ${reply.type}`);
  }
}
