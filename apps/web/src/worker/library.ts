// The activity library: every activity the person added, kept in memory for drawing and in
// IndexedDB for the next visit.

import {
  frequentPlaces,
  importFiles,
  matchActivities,
  nearPlacesText,
  parseSettings,
  trackLengthM,
  type FrequentPlace,
  type RandomAccessFile,
  type SettingsInput,
  type Track,
  type TrackEnd,
} from '@wornways/engine';
import type {
  ActivitySummary,
  ImportReport,
  MatchReport,
  PickedFile,
  Progress,
} from '../messages.ts';
import { createActivityStore, type ActivityStore } from './store.ts';

/** Starts (or ends) this close together count as one place. */
const PLACE_RADIUS_M = 500;
const PLACES_SUGGESTED = 6;

/** A picked file, read part by part, so a large archive is never read whole. */
const randomAccess = ({ path, file }: PickedFile): RandomAccessFile => ({
  name: path,
  size: file.size,
  read: async (offset, length) =>
    new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()),
});

export class Library {
  private pending: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly store: ActivityStore,
    private activities: Map<string, Track>,
  ) {}

  static async open(): Promise<Library> {
    const store = createActivityStore();
    const stored = await store.readAll();
    return new Library(store, new Map(stored.map((a) => [a.id, a])));
  }

  /** Every activity, newest first. */
  all(): Track[] {
    return [...this.activities.values()].sort((a, b) => b.startTime - a.startTime);
  }

  /** What the page shows of every activity, newest first. */
  summaries(): ActivitySummary[] {
    return this.all().map((a) => ({
      id: a.id,
      name: a.name ?? a.id,
      sport: a.sport,
      startTime: a.startTime,
      distanceM: trackLengthM(a),
    }));
  }

  /** Reads the files and stores the activities that are new. */
  add(files: PickedFile[], onProgress: (progress: Progress) => void): Promise<ImportReport> {
    return this.update(() => this.import(files, onProgress));
  }

  private async import(
    files: PickedFile[],
    onProgress: (progress: Progress) => void,
  ): Promise<ImportReport> {
    const result = await importFiles(files.map(randomAccess), {
      known: this.activities,
      onProgress: ({ done, total }) => onProgress({ stage: 'reading', done, total }),
    });
    // Activities added before without the export's activity list get its names and sports.
    const renamed: Track[] = [];
    for (const { id, name, sport } of result.listedSkipped) {
      const known = this.activities.get(id);
      if (!known) continue;
      const updated = { ...known, name: name || known.name, sport: sport || known.sport };
      if (known.name !== updated.name || known.sport !== updated.sport) renamed.push(updated);
    }
    onProgress({ stage: 'storing' });
    await this.store.put([...result.activities, ...renamed]);
    for (const activity of [...result.activities, ...renamed])
      this.activities.set(activity.id, activity);
    return {
      added: result.activities.length,
      alreadyThere: result.skipped + result.duplicates,
      renamed: renamed.length,
      withoutGps: result.withoutGps,
      unreadable: result.unreadable,
      ignored: result.ignored,
    };
  }

  delete(ids: string[] | 'all'): Promise<void> {
    return this.update(async () => {
      if (ids === 'all') {
        await this.store.deleteAll();
        this.activities.clear();
      } else {
        await this.store.delete(ids);
        for (const id of ids) this.activities.delete(id);
      }
    });
  }

  /** Read and write under one lock so imports in two tabs cannot reuse the same ID. */
  private update<T>(operation: () => Promise<T>): Promise<T> {
    const update = async () => {
      const stored = await this.store.readAll();
      this.activities = new Map(stored.map((a) => [a.id, a]));
      return operation();
    };
    const result = this.pending.then(
      () => navigator.locks?.request('wornways-library', update) ?? update(),
    );
    this.pending = result.catch(() => {});
    return result;
  }

  /** Which activities the settings choose. */
  match(input: SettingsInput): MatchReport {
    const settings = parseSettings(input);
    const match = matchActivities(this.all(), settings);
    const problem =
      match.problem === 'nothing-matches'
        ? 'No activity matches these settings.'
        : match.problem === 'nothing-near'
          ? `None of these activities ${nearPlacesText(settings)}.`
          : null;
    return { ids: match.kept.map((a) => a.id), problem };
  }

  /** The places most of the activities the settings choose start or end at, busiest first. */
  places(input: SettingsInput, end: TrackEnd): FrequentPlace[] {
    const chosen = matchActivities(this.all(), parseSettings(input)).kept;
    // Every place counts, also one activity: a short period still gets suggestions.
    return frequentPlaces(chosen, end, PLACE_RADIUS_M, PLACES_SUGGESTED, 1);
  }
}
