// Reading the activities a replay may show, from the library or from the files named, and
// selecting the ones the settings choose.

import {
  MIN_LENGTH_M,
  importFiles,
  nearPlacesText,
  selectTracks,
  trackLengthM,
  type NearPlace,
  type RenderSettings,
  type Track,
} from '@wornways/engine';
import { filesAt } from './files.ts';
import { Library, libraryFolder } from './library.ts';
import { fail, isoDay, oneLine } from './terminal.ts';

export type Loaded = {
  tracks: Track[];
  /** Activities read: from the library, or from the files named. */
  activities: number;
  readMs: number;
  cleanMs: number;
};

const PROBLEMS = {
  'nothing-matches': 'nothing matches the filters',
  'nothing-usable': 'no usable tracks after cleaning',
  'nothing-after-trim': 'no usable route remains after trimming. Reduce --trim-radius',
};

/**
 * The activities of the files, folders and archives named, without storing them. All are
 * read, as an id may be known only once a file is read (as in a Garmin export).
 */
async function readPaths(paths: string[]): Promise<Track[]> {
  const files = await filesAt(paths);
  const result = await importFiles(files);
  console.log(
    `Read       ${result.activities.length} activities from ${files.length} ${files.length === 1 ? 'file' : 'files'}`,
  );
  if (result.withoutGps.length)
    console.log(`           ${result.withoutGps.length} had no position data`);
  if (result.duplicates)
    console.log(`           ${result.duplicates} left out as the same activity as another file`);
  for (const { file, reason } of result.unreadable) console.warn(`  skipped  ${file}: ${reason}`);
  return result.activities;
}

/** The activities of the library. */
async function readLibrary(): Promise<Track[]> {
  const library = await Library.open();
  if (library.size === 0)
    fail(`your library is empty; add activities with "wornways import" (${libraryFolder()})`);
  console.log(`Library    ${library.size} activities`);
  return library.all();
}

/**
 * Reads the activities of the files, folders and archives in `paths`, or of the library when
 * none are given, keeps the ones the settings select, and cleans their tracks.
 */
export async function loadTracks(paths: string[], settings: RenderSettings): Promise<Loaded> {
  const tRead = performance.now();
  const activities = paths.length ? await readPaths(paths) : await readLibrary();
  const readMs = performance.now() - tRead;

  const tClean = performance.now();
  const selection = selectTracks(activities, settings);
  const cleanMs = performance.now() - tClean;

  const { matched } = selection;
  const notes = [
    settings.sports ? `sport ${settings.sports.join(', ')}` : 'all sports',
    settings.from !== null || settings.to !== null
      ? `${isoDay(settings.from ?? matched[0]?.startTime ?? 0)} to ${settings.to !== null ? isoDay(settings.to - 1) : '...'}`
      : null,
    settings.activities !== null ? `id ${settings.activities.join(', ')}` : null,
  ].filter(Boolean);
  console.log(`Selected   ${matched.length} activities with GPS (${notes.join('; ')})`);
  if (selection.problem === 'nothing-matches') fail(PROBLEMS['nothing-matches']);

  const { startNear, endNear } = settings;
  const at = (near: NearPlace) =>
    `${near.place.lat.toFixed(5)}, ${near.place.lon.toFixed(5)} (within ${near.radius} m)`;
  if (startNear) console.log(`Start near ${at(startNear)}`);
  if (endNear) console.log(`End near   ${at(endNear)}`);
  if (startNear || endNear) {
    console.log(`           ${selection.nearPlaces} of ${matched.length} kept`);
    const away = (m: number) => `${(m / 1000).toFixed(1)} km away`;
    for (const { track, startsAwayM, endsAwayM } of selection.farAway) {
      const reasons = [
        startsAwayM !== null ? `starts ${away(startsAwayM)}` : null,
        endsAwayM !== null ? `ends ${away(endsAwayM)}` : null,
      ].filter(Boolean);
      console.log(
        `  dropped  ${isoDay(track.startTime)}  ${oneLine(track)}  (${reasons.join(', ')})`,
      );
    }
    if (selection.problem === 'nothing-near') fail(`no activity ${nearPlacesText(settings)}`);
  }
  if (selection.problem === 'nothing-usable') fail(PROBLEMS['nothing-usable']);
  if (selection.problem === 'nothing-after-trim') fail(PROBLEMS['nothing-after-trim']);

  const cleaned = selection.tracks;
  const km = cleaned.reduce((sum, t) => sum + trackLengthM(t), 0) / 1000;
  console.log(
    `Tracks     ${cleaned.length}, ${km.toFixed(0)} km, ${selection.rawPoints.toLocaleString('en-US')} points thinned to ${selection.keptPoints.toLocaleString('en-US')}`,
  );
  for (const { track, start, end } of selection.trimmed) {
    const where = [start ? `${start} at the start` : null, end ? `${end} at the end` : null]
      .filter(Boolean)
      .join(', ');
    console.log(`  trimmed  ${isoDay(track.startTime)}  ${oneLine(track)}  (${where}: GPS jump)`);
  }
  for (const track of selection.tooShort)
    console.log(
      `  left out ${isoDay(track.startTime)}  ${oneLine(track)}  (${track.sport}, under ${MIN_LENGTH_M} m on the map)`,
    );
  if (selection.privacyOmitted)
    console.log(`Trim       ${selection.privacyOmitted} left out after trimming`);
  return { tracks: cleaned, activities: activities.length, readMs, cleanMs };
}
