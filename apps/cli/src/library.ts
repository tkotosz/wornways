// The activity library on disk: activities imported once and read again by every render.
//
// <home>/library/activities.json   id, name, sport and start of every activity, and the
//                                   sensor channels and calories of those that have them
// <home>/library/points/<id>.f64   the activity's points as raw 64-bit floats
// <home>/library/sensors/<id>.f32  its sensor channels as raw 32-bit floats, one channel
//                                   after another in the order the list names them
//
// <home> is $WORNWAYS_HOME, else ~/.wornways. Points are stored raw rather than as JSON
// numbers: reading 770 activities takes 0.06 s this way and 2 s as JSON. They are written
// in the machine's byte order, which is little-endian on every machine Node runs on here.

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import {
  SENSOR_CHANNELS,
  STRIDE,
  importFiles,
  type ImportProgress,
  type RandomAccessFile,
  type SensorChannel,
  type Sensors,
  type Track,
} from '@wornways/engine';

type StoredActivity = Pick<Track, 'id' | 'name' | 'sport' | 'startTime' | 'calories'> & {
  /** The channels in the sensors file, in order; absent when it has none. */
  sensors?: SensorChannel[];
};

/** The library folder: `$WORNWAYS_HOME/library`, else `~/.wornways/library`. */
export function libraryFolder(): string {
  const home = process.env['WORNWAYS_HOME'] || path.join(homedir(), '.wornways');
  return path.join(home, 'library');
}

const isMissing = (error: unknown) => (error as { code?: unknown })?.code === 'ENOENT';
const SQLITE_BUSY = 5;

/** Publish a complete file with one rename. Writers hold the library lock. */
async function replaceFile(file: string, contents: string | Uint8Array): Promise<void> {
  const temporary = `${file}.tmp`;
  try {
    await writeFile(temporary, contents);
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export class Library {
  private constructor(
    private readonly folder: string,
    private activities: Map<string, Track>,
  ) {}

  /** Reads the library in `folder`; an empty library when there is none yet. */
  static async open(folder: string = libraryFolder()): Promise<Library> {
    const library = new Library(folder, new Map());
    try {
      library.activities = await library.read();
    } catch (error) {
      // A deletion may have published a new list and removed points while we read the old list.
      if (!isMissing(error)) throw error;
      library.activities = await library.read();
    }
    return library;
  }

  private async read(): Promise<Map<string, Track>> {
    let stored: StoredActivity[] = [];
    try {
      stored = JSON.parse(await readFile(path.join(this.folder, 'activities.json'), 'utf8'));
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    const activities = new Map<string, Track>();
    for (const { sensors: channels, ...activity } of stored) {
      const bytes = await readFile(this.pointsFile(activity.id));
      // A copy, so that the points start at an offset a Float64Array can use.
      const points = new Float64Array(new Uint8Array(bytes).buffer);
      const track: Track = { ...activity, points };
      if (channels?.length) {
        const values = new Float32Array(
          new Uint8Array(await readFile(this.sensorsFile(activity.id))).buffer,
        );
        const n = points.length / STRIDE;
        const sensors: Sensors = {};
        channels.forEach((channel, k) => (sensors[channel] = values.slice(k * n, (k + 1) * n)));
        track.sensors = sensors;
      }
      activities.set(activity.id, track);
    }
    return activities;
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
    await this.write((current) => this.store(current, activities));
  }

  /** Imports files against the same library snapshot used to save their IDs. */
  async add(files: RandomAccessFile[], onProgress: (progress: ImportProgress) => void) {
    return this.write(async (current) => {
      const result = await importFiles(files, { known: current, onProgress });
      const renamed: Track[] = [];
      for (const { id, name, sport } of result.listedSkipped) {
        const known = current.get(id);
        if (!known) continue;
        const updated = { ...known, name: name || known.name, sport: sport || known.sport };
        if (known.name !== updated.name || known.sport !== updated.sport) renamed.push(updated);
      }
      const changed = [...result.activities, ...renamed];
      if (changed.length) await this.store(current, changed);
      this.activities = current;
      return { ...result, renamed: renamed.length };
    });
  }

  private async store(current: Map<string, Track>, activities: Track[]): Promise<void> {
    await mkdir(path.join(this.folder, 'points'), { recursive: true });
    for (const activity of activities) {
      const { points } = activity;
      await replaceFile(
        this.pointsFile(activity.id),
        new Uint8Array(points.buffer, points.byteOffset, points.byteLength),
      );
      const channels = sensorChannels(activity);
      if (channels.length) {
        await mkdir(path.join(this.folder, 'sensors'), { recursive: true });
        const n = points.length / STRIDE;
        const values = new Float32Array(channels.length * n);
        channels.forEach((channel, k) => values.set(activity.sensors![channel]!, k * n));
        await replaceFile(this.sensorsFile(activity.id), new Uint8Array(values.buffer));
      } else await rm(this.sensorsFile(activity.id), { force: true });
      current.set(activity.id, activity);
    }
    await this.writeList(current);
  }

  async delete(ids: string[]): Promise<void> {
    await this.write(async (current) => {
      for (const id of ids) current.delete(id);
      await this.writeList(current);
      for (const id of ids) {
        await rm(this.pointsFile(id), { force: true });
        await rm(this.sensorsFile(id), { force: true });
      }
    });
  }

  async deleteAll(): Promise<void> {
    await this.write(async (current) => {
      current.clear();
      await this.writeList(current);
      await rm(path.join(this.folder, 'points'), { recursive: true, force: true });
      await rm(path.join(this.folder, 'sensors'), { recursive: true, force: true });
    });
  }

  /** Serialize writers across CLI processes and reread the list once the lock is held. */
  private async write<T>(operation: (current: Map<string, Track>) => Promise<T>): Promise<T> {
    await mkdir(this.folder, { recursive: true });
    // SQLite provides a process-owned file lock that is released even if a command is killed.
    // The activity list and points keep their existing format.
    using lock = new DatabaseSync(path.join(this.folder, '.lock.sqlite'));
    const deadline = performance.now() + 10_000;
    for (;;) {
      try {
        lock.exec('BEGIN IMMEDIATE');
        break;
      } catch (error) {
        if ((error as { errcode?: number }).errcode !== SQLITE_BUSY) throw error;
        if (performance.now() >= deadline)
          throw new Error('The activity library is busy. Try again.', { cause: error });
        await delay(50);
      }
    }
    return await operation(await this.read());
  }

  /** Ids may hold any character, so they are encoded for file names. */
  private pointsFile(id: string): string {
    return path.join(this.folder, 'points', `${encodeURIComponent(id)}.f64`);
  }

  private sensorsFile(id: string): string {
    return path.join(this.folder, 'sensors', `${encodeURIComponent(id)}.f32`);
  }

  /** Writes the list through a temporary file, so a crash never leaves half a list. */
  private async writeList(activities: Map<string, Track>): Promise<void> {
    const list: StoredActivity[] = [...activities.values()]
      .sort((a, b) => b.startTime - a.startTime)
      .map((activity) => {
        const { id, name, sport, startTime, calories } = activity;
        const sensors = sensorChannels(activity);
        return {
          id,
          name,
          sport,
          startTime,
          ...(calories === undefined ? {} : { calories }),
          ...(sensors.length ? { sensors } : {}),
        };
      });
    const file = path.join(this.folder, 'activities.json');
    await replaceFile(file, JSON.stringify(list));
    this.activities = activities;
  }
}

/** The sensor channels an activity has values for, in a fixed order. */
function sensorChannels(activity: Track): SensorChannel[] {
  return SENSOR_CHANNELS.filter((channel) => activity.sensors?.[channel]);
}
