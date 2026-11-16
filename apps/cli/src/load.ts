// Reading the activity files of a folder and selecting the ones a replay shows.

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  MIN_LENGTH_M,
  formatFromFilename,
  nearPlacesText,
  parseActivitiesIndex,
  parseActivity,
  sameActivity,
  selectTracks,
  sportIncluded,
  trackLengthM,
  type IndexEntry,
  type NearPlace,
  type RenderSettings,
  type Track,
} from '@wornways/engine';
import { fail, isoDay, oneLine } from './terminal.ts';

type Candidate = { id: string; name: string; file: string; sport?: string; startTime?: number };

/** Strava's index lists "x.fit.gz"; prefer an already unpacked "x.fit" beside it. */
function resolveFile(dir: string, filename: string): string | null {
  const full = path.join(dir, path.basename(filename));
  if (full.endsWith('.gz') && existsSync(full.slice(0, -3))) return full.slice(0, -3);
  return existsSync(full) ? full : null;
}

async function listCandidates(
  dir: string,
  indexPath: string | null,
): Promise<{ candidates: Candidate[]; missing: number }> {
  if (indexPath) {
    const entries: IndexEntry[] = parseActivitiesIndex(await readFile(indexPath, 'utf8'));
    const candidates: Candidate[] = [];
    let missing = 0;
    for (const e of entries) {
      if (!e.filename || !formatFromFilename(e.filename)) continue; // manual entry, no file
      const file = resolveFile(dir, e.filename);
      if (!file) {
        missing++;
        continue;
      }
      candidates.push({
        id: e.id,
        name: e.name,
        file,
        sport: e.sport,
        startTime: Number.isNaN(e.startTime) ? undefined : e.startTime,
      });
    }
    return { candidates, missing };
  }
  const names = new Set(await readdir(dir));
  const candidates: Candidate[] = [];
  for (const name of [...names].sort()) {
    if (!formatFromFilename(name)) continue;
    if (name.endsWith('.gz') && names.has(name.slice(0, -3))) continue; // duplicate of the unpacked file
    candidates.push({
      id: name.replace(/\.(fit|gpx|tcx)(\.gz)?$/i, ''),
      name,
      file: path.join(dir, name),
    });
  }
  return { candidates, missing: 0 };
}

export type Loaded = {
  tracks: Track[];
  files: number;
  parseMs: number;
  cleanMs: number;
};

const PROBLEMS = {
  'nothing-matches': 'nothing matches the filters',
  'nothing-usable': 'no usable tracks after cleaning',
};

/**
 * Reads the activity files in `dir`, keeps the ones the settings select, and cleans their
 * tracks. `index` is the path of an activities.csv; without it one next to the folder is used.
 */
export async function loadTracks(
  dir: string,
  index: string | undefined,
  settings: RenderSettings,
): Promise<Loaded> {
  const from = settings.from ?? -Infinity;
  const to = settings.to ?? Infinity;
  const indexGuess = [path.join(dir, '..', 'activities.csv'), path.join(dir, 'activities.csv')];
  const indexPath = index ? path.resolve(index) : (indexGuess.find((p) => existsSync(p)) ?? null);
  if (index && !existsSync(indexPath!)) fail(`index not found: ${indexPath}`);
  const { candidates, missing } = await listCandidates(dir, indexPath);
  console.log(
    indexPath
      ? `Index      ${candidates.length} activities with files (${path.relative(process.cwd(), indexPath) || indexPath})`
      : `Folder     ${candidates.length} activity files (no activities.csv, sport comes from each file)`,
  );
  if (missing) console.log(`           ${missing} listed in the index but not found in the folder`);

  // The index allows skipping files before reading them. Dates get a day of slack here
  // and are checked exactly against the file's own first timestamp when selecting.
  const DAY = 86400000;
  const preselected = candidates.filter(
    (c) =>
      (settings.activities === null || settings.activities.includes(c.id)) &&
      (c.sport === undefined || sportIncluded(settings, c.sport)) &&
      (c.startTime === undefined || (c.startTime >= from - DAY && c.startTime < to + DAY)),
  );

  const tParse = performance.now();
  const tracks: Track[] = [];
  const skipped: string[] = [];
  let noPosition = 0;
  let duplicates = 0;
  for (const c of preselected) {
    try {
      const raw = await readFile(c.file);
      const bytes = c.file.endsWith('.gz') ? gunzipSync(raw) : raw;
      const parsed = parseActivity(bytes, formatFromFilename(c.file)!);
      if (!parsed) {
        noPosition++;
        continue;
      }
      // The same activity in another file, e.g. a GPX file next to the FIT file of a ride.
      if (tracks.some((t) => sameActivity(t, parsed))) {
        duplicates++;
        continue;
      }
      // The activity list's name, else the file's own, else the file name.
      const name = (indexPath && c.name) || parsed.name || c.name;
      tracks.push({ ...parsed, id: c.id, name, sport: c.sport ?? parsed.sport });
    } catch (err) {
      skipped.push(`${path.basename(c.file)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const parseMs = performance.now() - tParse;

  const tClean = performance.now();
  const selection = selectTracks(tracks, settings);
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
  if (noPosition) console.log(`           ${noPosition} had no position data`);
  if (duplicates)
    console.log(`           ${duplicates} left out as the same activity as another file`);
  for (const s of skipped) console.warn(`  skipped  ${s}`);
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
  return { tracks: cleaned, files: preselected.length, parseMs, cleanMs };
}
