// Reading the activities out of the files a person adds: activity files (FIT, GPX, TCX,
// also gzip-compressed), ZIP archives such as an account export, and the activities.csv
// list of an export, which gives activities their names and sports.

import { distanceM } from '../track/geo.ts';
import { trackStart } from '../track/places.ts';
import type { ParsedActivity, Track } from '../track/types.ts';
import { parseActivitiesIndex, type IndexEntry } from './index-csv.ts';
import { formatFromFilename, parseActivity } from './parse.ts';
import { gunzip } from './unpack.ts';
import { listZip, readZipEntry, type RandomAccessFile } from './zip.ts';

export type ImportResult = {
  /** The activities read, with the id, name and sport from activities.csv where listed. */
  activities: Track[];
  /** Activities left out because `skip` asked for it, e.g. because they are known already. */
  skipped: number;
  /**
   * Activities left out as the same activity as one read before or known already, but
   * from another file, such as a FIT and a GPX file of one ride.
   */
  duplicates: number;
  /**
   * The name and sport activities.csv gives skipped activities, so that activities added
   * before without the list can be named afterwards.
   */
  listedSkipped: { id: string; name: string; sport: string }[];
  /** Files with an activity but no positions, such as an indoor workout. */
  withoutGps: string[];
  /** Files that could not be read, and why. */
  unreadable: { file: string; reason: string }[];
  /** Files that are not activities, e.g. the photos or planned routes of an export. */
  ignored: number;
};

export type ImportProgress = { done: number; total: number };

export type ImportOptions = {
  /** Called with the activity id before a file is read; true leaves the activity out. */
  skip?: (id: string) => boolean;
  /** Called with each activity read; true leaves it out as the same as one known already. */
  isKnown?: (activity: ParsedActivity) => boolean;
  onProgress?: (progress: ImportProgress) => void;
};

/** One file to read: a file of its own or an entry of an archive. */
type Source = { path: string; read: () => Promise<Uint8Array> };

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
/** Index entries and files are matched by file name, with or without ".gz". */
const matchKey = (path: string) => baseName(path).toLowerCase().replace(/\.gz$/, '');
const isIndex = (path: string) => baseName(path).toLowerCase() === 'activities.csv';
const isZip = (path: string) => path.toLowerCase().endsWith('.zip');
/** An account export keeps planned routes in a "routes" folder; they are not activities. */
const isPlannedRoute = (path: string) => /(^|\/)routes\//i.test(path);
/** The id of an activity no index lists: its file name without the extensions. */
const idFromName = (path: string) => baseName(path).replace(/\.(fit|gpx|tcx)(\.gz)?$/i, '');

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Starts closer in time than this are taken for the same activity, when also close in place. */
const SAME_START_MS = 60_000;
const SAME_START_M = 200;

/**
 * Whether two activities are one, recorded in two files: they start within a minute and
 * 200 meters of each other.
 */
export function sameActivity(a: ParsedActivity, b: ParsedActivity): boolean {
  if (Math.abs(a.startTime - b.startTime) > SAME_START_MS) return false;
  const [sa, sb] = [trackStart(a), trackStart(b)];
  return distanceM(sa.lat, sa.lon, sb.lat, sb.lon) <= SAME_START_M;
}

export async function importFiles(
  files: RandomAccessFile[],
  options: ImportOptions = {},
): Promise<ImportResult> {
  const result: ImportResult = {
    activities: [],
    skipped: 0,
    duplicates: 0,
    listedSkipped: [],
    withoutGps: [],
    unreadable: [],
    ignored: 0,
  };

  // Collect the activity files and the activity lists, looking inside archives.
  const candidates: Source[] = [];
  const indexes: Source[] = [];
  const sort = (source: Source) => {
    if (isIndex(source.path)) indexes.push(source);
    else if (formatFromFilename(source.path) && !isPlannedRoute(source.path))
      candidates.push(source);
    else result.ignored++;
  };
  for (const file of files) {
    if (!isZip(file.name)) {
      sort({ path: file.name, read: () => file.read(0, file.size) });
      continue;
    }
    try {
      for (const entry of await listZip(file))
        sort({ path: `${file.name}/${entry.path}`, read: () => readZipEntry(file, entry) });
    } catch (error) {
      result.unreadable.push({ file: file.name, reason: reasonOf(error) });
    }
  }

  const listed = new Map<string, IndexEntry>();
  for (const index of indexes) {
    try {
      const text = new TextDecoder('utf-8').decode(await index.read());
      for (const entry of parseActivitiesIndex(text))
        if (entry.filename) listed.set(matchKey(entry.filename), entry);
    } catch (error) {
      result.unreadable.push({ file: index.path, reason: reasonOf(error) });
    }
  }

  const seen = new Set<string>();
  for (const [done, source] of candidates.entries()) {
    options.onProgress?.({ done, total: candidates.length });
    const entry = listed.get(matchKey(source.path));
    const id = entry?.id ?? idFromName(source.path);
    // The same activity can come twice, e.g. unpacked next to its .gz file.
    if (seen.has(id)) continue;
    seen.add(id);
    if (options.skip?.(id)) {
      result.skipped++;
      if (entry) result.listedSkipped.push({ id, name: entry.name, sport: entry.sport });
      continue;
    }
    try {
      let bytes = await source.read();
      if (/\.gz$/i.test(source.path)) bytes = await gunzip(bytes);
      const parsed = parseActivity(bytes, formatFromFilename(source.path)!);
      if (!parsed) {
        result.withoutGps.push(baseName(source.path));
        continue;
      }
      if (options.isKnown?.(parsed) || result.activities.some((a) => sameActivity(a, parsed))) {
        result.duplicates++;
        continue;
      }
      result.activities.push({
        ...parsed,
        id,
        // The activity list's name, else the file's own, else the file name.
        name: entry?.name || parsed.name || idFromName(source.path),
        sport: entry?.sport || parsed.sport,
      });
    } catch (error) {
      result.unreadable.push({ file: baseName(source.path), reason: reasonOf(error) });
    }
  }
  options.onProgress?.({ done: candidates.length, total: candidates.length });
  return result;
}
