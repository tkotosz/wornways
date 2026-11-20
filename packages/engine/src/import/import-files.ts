// Reading the activities out of the files a person adds: activity files (FIT, GPX, TCX,
// also gzip-compressed), ZIP archives such as an account export (also ZIP files inside
// them, as in a Garmin export), and the activity list of an export, which gives activities
// their names and sports: Strava's activities.csv or Garmin's summarizedActivities files.

import { distanceM } from '../track/geo.ts';
import { trackStart } from '../track/places.ts';
import type { ParsedActivity, Track } from '../track/types.ts';
import { FIT_FILE_ACTIVITY, fitFileType } from './fit.ts';
import { findGarminEntry, isGarminList, parseGarminList, type GarminEntry } from './garmin-list.ts';
import { parseActivitiesIndex, type IndexEntry } from './index-csv.ts';
import { formatFromFilename, parseActivity } from './parse.ts';
import { gunzip } from './unpack.ts';
import { listZip, readZipEntry, type RandomAccessFile, type ZipEntry } from './zip.ts';

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
  /**
   * Files that are not activities, e.g. the photos or planned routes of an export, or the
   * daily monitoring and sleep files of a watch.
   */
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
/**
 * A file's name as the person is shown it. Garmin names the files of its export after the
 * account's email address ("name@example.com_123.fit"), which is left out.
 */
const fileLabel = (path: string) => baseName(path).replace(/^[^@_]+@[^@_]+_/, '');
/** Index entries and files are matched by file name, with or without ".gz". */
const matchKey = (path: string) => baseName(path).toLowerCase().replace(/\.gz$/, '');
const isIndex = (path: string) => baseName(path).toLowerCase() === 'activities.csv';
const isZip = (path: string) => path.toLowerCase().endsWith('.zip');
/** An account export keeps planned routes in a "routes" folder; they are not activities. */
const isPlannedRoute = (path: string) => /(^|\/)routes\//i.test(path);
/** The id of an activity no index lists: its file name without the extensions. */
const idFromName = (path: string) => fileLabel(path).replace(/\.(fit|gpx|tcx)(\.gz)?$/i, '');
/** ZIP files inside ZIP files are opened this many levels deep. */
const NESTED_ZIP_DEPTH = 2;

/** Data in memory, read like a file; for a ZIP file inside an archive. */
const memoryFile = (name: string, bytes: Uint8Array): RandomAccessFile => ({
  name,
  size: bytes.length,
  read: async (offset, length) => bytes.subarray(offset, offset + length),
});

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
  const garminLists: Source[] = [];
  const sort = (source: Source) => {
    if (isIndex(source.path)) indexes.push(source);
    else if (isGarminList(source.path)) garminLists.push(source);
    else if (formatFromFilename(source.path) && !isPlannedRoute(source.path))
      candidates.push(source);
    else result.ignored++;
  };
  const openArchive = async (archive: RandomAccessFile, depth: number) => {
    let entries: ZipEntry[];
    try {
      entries = await listZip(archive);
    } catch (error) {
      result.unreadable.push({ file: fileLabel(archive.name), reason: reasonOf(error) });
      return;
    }
    for (const entry of entries) {
      const path = `${archive.name}/${entry.path}`;
      if (!isZip(path) || depth >= NESTED_ZIP_DEPTH) {
        sort({ path, read: () => readZipEntry(archive, entry) });
        continue;
      }
      // A ZIP file inside is read into memory whole: its entries are packed, not seekable.
      try {
        await openArchive(memoryFile(path, await readZipEntry(archive, entry)), depth + 1);
      } catch (error) {
        result.unreadable.push({ file: fileLabel(path), reason: reasonOf(error) });
      }
    }
  };
  for (const file of files) {
    if (isZip(file.name)) await openArchive(file, 1);
    else sort({ path: file.name, read: () => file.read(0, file.size) });
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

  const garmin: GarminEntry[] = [];
  for (const list of garminLists) {
    try {
      garmin.push(...parseGarminList(new TextDecoder('utf-8').decode(await list.read())));
    } catch (error) {
      result.unreadable.push({ file: fileLabel(list.path), reason: reasonOf(error) });
    }
  }

  const seen = new Set<string>();
  const skipped = new Map<string, (typeof result.listedSkipped)[number] | undefined>();
  for (const [done, source] of candidates.entries()) {
    options.onProgress?.({ done, total: candidates.length });
    const entry = listed.get(matchKey(source.path));
    const fileId = entry?.id ?? idFromName(source.path);
    // A Garmin list can assign a different ID, so unlisted files need to be read first.
    const idKnown = entry !== undefined || garmin.length === 0;
    if (idKnown && seen.has(fileId)) continue;
    if (idKnown && options.skip?.(fileId)) {
      if (entry) skipped.set(fileId, { id: fileId, name: entry.name, sport: entry.sport });
      else if (!skipped.has(fileId)) skipped.set(fileId, undefined);
      continue;
    }
    try {
      let bytes = await source.read();
      if (/\.gz$/i.test(source.path)) bytes = await gunzip(bytes);
      const format = formatFromFilename(source.path)!;
      // A watch's export also holds its daily monitoring, sleep and settings files.
      const fitType = format === 'fit' ? fitFileType(bytes) : null;
      if (fitType !== null && fitType !== FIT_FILE_ACTIVITY) {
        result.ignored++;
        continue;
      }
      const parsed = parseActivity(bytes, format);
      if (!parsed) {
        result.withoutGps.push(fileLabel(source.path));
        continue;
      }
      // Garmin's list is matched by time, so its id is known only now.
      const garminEntry = entry ? null : findGarminEntry(garmin, parsed.startTime);
      const id = garminEntry?.id ?? fileId;
      if (seen.has(id)) {
        result.duplicates++;
        continue;
      }
      if (!idKnown && options.skip?.(id)) {
        if (garminEntry)
          skipped.set(id, { id, name: garminEntry.name, sport: garminEntry.sport || parsed.sport });
        else if (!skipped.has(id)) skipped.set(id, undefined);
        continue;
      }
      if (options.isKnown?.(parsed) || result.activities.some((a) => sameActivity(a, parsed))) {
        result.duplicates++;
        continue;
      }
      const listName = entry?.name || garminEntry?.name;
      seen.add(id);
      result.activities.push({
        ...parsed,
        id,
        // The activity list's name, else the file's own, else the file name.
        name: listName || parsed.name || idFromName(source.path),
        sport: entry?.sport || garminEntry?.sport || parsed.sport,
      });
    } catch (error) {
      result.unreadable.push({ file: fileLabel(source.path), reason: reasonOf(error) });
    }
  }
  result.skipped = skipped.size;
  result.listedSkipped = [...skipped.values()].filter((entry) => entry !== undefined);
  options.onProgress?.({ done: candidates.length, total: candidates.length });
  return result;
}
