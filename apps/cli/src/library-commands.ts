// The commands that fill and tidy the library: import, list, delete and delete-all.

import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { importFiles, sameActivity, trackLengthM, type Track } from '@wornways/engine';
import { filesAt } from './files.ts';
import { Library, libraryFolder } from './library.ts';
import { fail, isoDay, oneLine } from './terminal.ts';

const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export const IMPORT_HELP = `wornways import <path>...

Adds activities to your library, which "wornways render" shows. A path is a FIT, GPX or TCX
file (also .gz), a folder of them, or a Strava or Garmin account export ZIP as it is; the
names and sports come from the export's activity list. Activities already in the library
are not added again, also when they come from another file of the same activity.

The library is kept in ${libraryFolder()} ($WORNWAYS_HOME/library when set).`;

export async function importCommand(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { help: { type: 'boolean' } },
  });
  if (values.help) return void console.log(IMPORT_HELP);
  if (positionals.length === 0) fail('missing <path>; run "wornways import --help"');

  const files = await filesAt(positionals);
  const library = await Library.open();
  const known = library.all();
  const progress = process.stderr.isTTY
    ? (text: string) => process.stderr.write(`\r${text}\x1b[K`)
    : () => {};
  const result = await importFiles(files, {
    skip: (id) => library.has(id),
    // The same activity from another file, e.g. a GPX file of a ride imported as FIT before.
    isKnown: (activity) => known.some((k) => sameActivity(k, activity)),
    onProgress: ({ done, total }) => progress(`Reading ${done}/${total} files`),
  });
  progress('');
  // Activities imported before without the export's activity list get its names and sports.
  const renamed: Track[] = [];
  for (const { id, name, sport } of result.listedSkipped) {
    const activity = library.get(id);
    if (activity && (activity.name !== name || activity.sport !== sport))
      renamed.push({ ...activity, name, sport });
  }
  await library.put([...result.activities, ...renamed]);

  const already = result.skipped + result.duplicates;
  console.log(
    `Imported ${count(result.activities.length, 'activity', 'activities')}` +
      (already ? `, ${already} already there` : '') +
      `; ${count(library.size, 'activity', 'activities')} in all.`,
  );
  if (renamed.length)
    console.log(`${count(renamed.length, 'activity was', 'activities were')} renamed.`);
  if (result.withoutGps.length)
    console.log(
      `${count(result.withoutGps.length, 'activity has', 'activities have')} no GPS route and ` +
        `${result.withoutGps.length === 1 ? 'was' : 'were'} left out.`,
    );
  for (const { file, reason } of result.unreadable) console.warn(`  skipped  ${file}: ${reason}`);
}

export const LIST_HELP = `wornways list

Lists the activities in your library, newest first: id, day, sport, distance and name.`;

export async function listCommand(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { help: { type: 'boolean' } } });
  if (values.help) return void console.log(LIST_HELP);
  const activities = (await Library.open()).all();
  if (activities.length === 0)
    return void console.log('Your library is empty; add activities with "wornways import".');
  const idWidth = Math.max(...activities.map((a) => a.id.length));
  const sportWidth = Math.max(...activities.map((a) => a.sport.length));
  for (const a of activities) {
    const km = `${(trackLengthM(a) / 1000).toFixed(1)} km`;
    console.log(
      `${a.id.padEnd(idWidth)}  ${isoDay(a.startTime)}  ${a.sport.padEnd(sportWidth)}  ${km.padStart(9)}  ${oneLine(a)}`,
    );
  }
  console.log(`${count(activities.length, 'activity', 'activities')}`);
}

export const DELETE_HELP = `wornways delete <id>... [--yes]
wornways delete-all [--yes]

Deletes activities from your library, by the ids "wornways list" shows, or all of them.
Asks first, unless --yes is given.`;

/** Asks a yes/no question on the terminal; anything but "y" or "yes" is no. */
async function confirm(question: string): Promise<boolean> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await terminal.question(`${question} [y/N] `)).trim());
  } finally {
    terminal.close();
  }
}

export async function deleteCommand(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { yes: { type: 'boolean' }, help: { type: 'boolean' } },
  });
  if (values.help) return void console.log(DELETE_HELP);
  if (positionals.length === 0) fail('missing <id>; run "wornways list" for the ids');
  const library = await Library.open();
  const unknown = positionals.filter((id) => !library.has(id));
  if (unknown.length) fail(`not in your library: ${unknown.join(', ')}`);

  const ids = [...new Set(positionals)];
  const question =
    ids.length === 1
      ? `Delete "${oneLine(library.get(ids[0]!)!)}" (${isoDay(library.get(ids[0]!)!.startTime)}) from your library?`
      : `Delete ${ids.length} activities from your library?`;
  if (!values.yes && !(await confirm(question))) return void console.log('Nothing was deleted.');
  await library.delete(ids);
  console.log(`Deleted ${count(ids.length, 'activity', 'activities')}.`);
}

export async function deleteAllCommand(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: { yes: { type: 'boolean' }, help: { type: 'boolean' } },
  });
  if (values.help) return void console.log(DELETE_HELP);
  const library = await Library.open();
  if (library.size === 0) return void console.log('Your library is empty.');
  const all = count(library.size, 'activity', 'activities');
  if (!values.yes && !(await confirm(`Delete all ${all} from your library?`)))
    return void console.log('Nothing was deleted.');
  await library.deleteAll();
  console.log(`Deleted ${all}.`);
}
