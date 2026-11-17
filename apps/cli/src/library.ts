// The activity library on disk: activities imported once and read again by every render.
//
// <home>/library/activities.json   id, name, sport and start of every activity
// <home>/library/points/<id>.f64   the activity's points as raw 64-bit floats
//
// <home> is $WORNWAYS_HOME, else ~/.wornways. Points are stored raw rather than as JSON
// numbers: reading 770 activities takes 0.06 s this way and 2 s as JSON. They are written
// in the machine's byte order, which is little-endian on every machine Node runs on here.

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { Track } from '@wornways/engine';

type StoredActivity = Pick<Track, 'id' | 'name' | 'sport' | 'startTime'>;

/** The library folder: `$WORNWAYS_HOME/library`, else `~/.wornways/library`. */
export function libraryFolder(): string {
  const home = process.env['WORNWAYS_HOME'] || path.join(homedir(), '.wornways');
  return path.join(home, 'library');
}

const isMissing = (error: unknown) => (error as { code?: unknown })?.code === 'ENOENT';

export class Library {
  private constructor(
    private readonly folder: string,
    private readonly activities: Map<string, Track>,
  ) {}

  /** Reads the library in `folder`; an empty library when there is none yet. */
  static async open(folder: string = libraryFolder()): Promise<Library> {
    let stored: StoredActivity[] = [];
    try {
      stored = JSON.parse(await readFile(path.join(folder, 'activities.json'), 'utf8'));
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    const library = new Library(folder, new Map());
    for (const activity of stored) {
      const bytes = await readFile(library.pointsFile(activity.id));
      // A copy, so that the points start at an offset a Float64Array can use.
      const points = new Float64Array(new Uint8Array(bytes).buffer);
      library.activities.set(activity.id, { ...activity, points });
    }
    return library;
  }

  get size(): number {
    return this.activities.size;
  }

  has(id: string): boolean {
    return this.activities.has(id);
  }

  get(id: string): Track | undefined {
    return this.activities.get(id);
  }

  /** Every activity, newest first. */
  all(): Track[] {
    return [...this.activities.values()].sort((a, b) => b.startTime - a.startTime);
  }

  /** Stores the activities, replacing ones with the same id. */
  async put(activities: Track[]): Promise<void> {
    if (activities.length === 0) return;
    await mkdir(path.join(this.folder, 'points'), { recursive: true });
    for (const activity of activities) {
      const { points } = activity;
      await writeFile(
        this.pointsFile(activity.id),
        new Uint8Array(points.buffer, points.byteOffset, points.byteLength),
      );
      this.activities.set(activity.id, activity);
    }
    await this.writeList();
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.activities.delete(id);
      await rm(this.pointsFile(id), { force: true });
    }
    await this.writeList();
  }

  async deleteAll(): Promise<void> {
    this.activities.clear();
    await rm(this.folder, { recursive: true, force: true });
  }

  /** Ids may hold any character, so they are encoded for file names. */
  private pointsFile(id: string): string {
    return path.join(this.folder, 'points', `${encodeURIComponent(id)}.f64`);
  }

  /** Writes the list through a temporary file, so a crash never leaves half a list. */
  private async writeList(): Promise<void> {
    const list: StoredActivity[] = this.all().map(({ id, name, sport, startTime }) => ({
      id,
      name,
      sport,
      startTime,
    }));
    const file = path.join(this.folder, 'activities.json');
    await mkdir(this.folder, { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(list));
    await rename(`${file}.tmp`, file);
  }
}
