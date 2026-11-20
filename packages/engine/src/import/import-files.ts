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
  /** Activities in the destination library, used to detect duplicates and reserve IDs. */
  known?: ReadonlyMap<string, Track>;
  /** An ID the caller explicitly wants to exclude. */
  skip?: (id: string) => boolean;
  /** Called with each activity read; true leaves it out as the same as one known already. */
  isKnown?: (activity: ParsedActivity) => boolean;
  onProgress?: (progress: ImportProgress) => void;
};

/** One file to read: a file of its own or an entry of an archive. */
type Source = { path: string; index: Map<string, IndexEntry>; read: () => Promise<Uint8Array> };

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const directory = (path: string) => path.slice(0, path.lastIndexOf('/') + 1);
/**
 * A file's name as the person is shown it. Garmin names the files of its export after the
 * account's email address ("name@example.com_123.fit"), which is left out.
 */
const fileLabel = (path: string) => baseName(path).replace(/^[^@_]+@[^@_]+_/, '');
/** Index paths are relative to the list, and match with or without ".gz". */
const matchKey = (path: string) => path.replaceAll('\\', '/').toLowerCase().replace(/\.gz$/, '');
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
  const looseIndex = new Map<string, IndexEntry>();
  // A browser file picker delivers individually selected files without their directories.
  const flatIndex = new Map<string, IndexEntry | null>();
  const sort = (source: Source) => {
    if (isIndex(source.path)) indexes.push(source);
    else if (isGarminList(source.path)) garminLists.push(source);
    else if (formatFromFilename(source.path) && !isPlannedRoute(source.path))
      candidates.push(source);
    else result.ignored++;
  };
  const openArchive = async (
    archive: RandomAccessFile,
    index: Map<string, IndexEntry>,
    depth: number,
  ) => {
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
        sort({ path, index, read: () => readZipEntry(archive, entry) });
        continue;
      }
      // A ZIP file inside is read into memory whole: its entries are packed, not seekable.
      try {
        await openArchive(memoryFile(path, await readZipEntry(archive, entry)), index, depth + 1);
      } catch (error) {
        result.unreadable.push({ file: fileLabel(path), reason: reasonOf(error) });
      }
    }
  };
  for (const file of files) {
    if (isZip(file.name)) await openArchive(file, new Map(), 1);
    else sort({ path: file.name, index: looseIndex, read: () => file.read(0, file.size) });
  }

  for (const index of indexes) {
    try {
      const text = new TextDecoder('utf-8').decode(await index.read());
      for (const entry of parseActivitiesIndex(text)) {
        if (!entry.filename) continue;
        const filename = matchKey(entry.filename).replace(/^\.\//, '');
        index.index.set(matchKey(directory(index.path)) + filename, entry);
        if (index.path === baseName(index.path)) {
          const key = baseName(filename);
          flatIndex.set(key, flatIndex.has(key) ? null : entry);
        }
      }
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
  const known = options.known ?? new Map<string, Track>();
  const knownTracks = [...known.values()];
  const skipped = new Map<string, (typeof result.listedSkipped)[number] | undefined>();
  for (const [done, source] of candidates.entries()) {
    options.onProgress?.({ done, total: candidates.length });
    const key = matchKey(source.path);
    const entry = source.index.get(key) ?? (!directory(key) ? flatIndex.get(key) : null);
    const listedId = entry?.id;
    // An explicitly skipped provider ID can be checked before reading the file.
    if (entry && listedId && options.skip?.(listedId)) {
      skipped.set(listedId, { id: listedId, name: entry.name, sport: entry.sport });
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
      const providerId = listedId || garminEntry?.id;
      const fileId = providerId ?? idFromName(source.path);
      const existing = providerId ? known.get(providerId) : undefined;
      if ((existing && sameActivity(existing, parsed)) || options.skip?.(fileId)) {
        if (entry || garminEntry) {
          skipped.set(fileId, {
            id: fileId,
            name: entry?.name || garminEntry?.name || '',
            sport: entry?.sport || garminEntry?.sport || '',
          });
        } else if (!skipped.has(fileId)) skipped.set(fileId, undefined);
        continue;
      }
      if (
        options.isKnown?.(parsed) ||
        knownTracks.some((a) => sameActivity(a, parsed)) ||
        result.activities.some((a) => sameActivity(a, parsed))
      ) {
        result.duplicates++;
        continue;
      }
      const listName = entry?.name || garminEntry?.name;
      let id = fileId;
      for (let copy = 2; seen.has(id) || known.has(id); copy++) id = `${fileId}-${copy}`;
      const activity = {
        ...parsed,
        id,
        // The activity list's name, else the file's own, else the file name.
        name: listName || parsed.name || idFromName(source.path),
        sport: entry?.sport || garminEntry?.sport || parsed.sport,
      };
      seen.add(id);
      result.activities.push(activity);
    } catch (error) {
      result.unreadable.push({ file: fileLabel(source.path), reason: reasonOf(error) });
    }
  }
  result.skipped = skipped.size;
  result.listedSkipped = [...skipped.values()].filter((entry) => entry !== undefined);
  options.onProgress?.({ done: candidates.length, total: candidates.length });
  return result;
}
