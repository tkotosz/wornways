#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createCanvas } from '@napi-rs/canvas';
import {
  GROUP_LABELS,
  SETTINGS,
  SettingsError,
  createTileLoader,
  parseSettings,
  prepareReplay,
  trackLengthM,
  videoFileName,
  type CanvasLike,
  type RenderSettings,
  type SettingDefinition,
  type SettingGroup,
  type SettingsInput,
} from '@wornways/engine';
import { deleteAllCommand, deleteCommand, importCommand, listCommand } from './library-commands.ts';
import { libraryFolder } from './library.ts';
import { loadTracks } from './load.ts';
import { fail, isoDay, oneLine } from './terminal.ts';
import { fileTileCache, tileCacheDir } from './tiles.ts';
import { describeReplay, describeTimings, writeVideo } from './video.ts';

/** Names the tool in requests to the map tile server, as its terms ask. */
const USER_AGENT = 'wornways-cli/0.0';

// ---------------------------------------------------------------------------------------
// Help, written from the settings table

const HELP_WIDTH = 90;
const FLAG_COLUMN = 24;

/** How the flag's value is named in help, e.g. "<seconds>"; empty for a switch. */
function valueName(setting: SettingDefinition): string {
  const kind = setting.kind;
  switch (kind.type) {
    case 'switch':
      return '';
    case 'number':
      return { m: '<meters>', s: '<seconds>', '%': '<percent>' }[kind.unit] ?? '<n>';
    case 'choice':
      return kind.choices.every((c) => /^\d+$/.test(c)) ? '<n>' : '<name>';
    case 'text':
      return `<${kind.valueName}>`;
    case 'list':
      return `<${kind.valueName ?? 'list'}>`;
    case 'day':
      return '<date>';
    case 'position':
      return '<lat,lon>';
    case 'size':
      return '<size>';
  }
}

/** The default as shown in help, e.g. "30" or "the first activity". */
function defaultText(setting: SettingDefinition): string {
  const value = setting.default;
  if (value === null) return setting.automatic ?? 'none';
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  return value;
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/** One help entry: the flag on the left, its wrapped description on the right. */
function helpEntry(flag: string, description: string): string {
  const lines = wrap(description, HELP_WIDTH - FLAG_COLUMN);
  const indent = ' '.repeat(FLAG_COLUMN);
  const first = `  ${flag}`;
  const head =
    first.length < FLAG_COLUMN
      ? first.padEnd(FLAG_COLUMN) + lines[0]
      : `${first}\n${indent}${lines[0]}`;
  return [head, ...lines.slice(1).map((l) => indent + l)].join('\n');
}

function settingHelp(setting: SettingDefinition): string {
  const value = valueName(setting);
  // A switch that is on by default is turned off with --no-<name>.
  const name = setting.default === true ? `[no-]${setting.name}` : setting.name;
  return helpEntry(
    `--${name}${value ? ` ${value}` : ''}`,
    `${setting.help} [${defaultText(setting)}]`,
  );
}

function groupHelp(group: SettingGroup): string {
  const entries = SETTINGS.filter((s) => s.group === group).map(settingHelp);
  if (group === 'activities')
    entries.push(
      helpEntry(
        '--activity-id <id>',
        'Include one literal ID, even if it contains a comma. Repeat to include more IDs.',
      ),
    );
  return [GROUP_LABELS[group], ...entries].join('\n');
}

const RENDER_HELP = `wornways render [<path>...] [flags]

Turns GPS activities into a heatmap replay video.

Without a path it shows the activities in your library (see "wornways import"). With paths
it reads those instead, without adding them to the library: FIT, GPX or TCX files (also
.gz), folders of them, or a Strava or Garmin account export ZIP.

${(Object.keys(GROUP_LABELS) as SettingGroup[]).map(groupHelp).join('\n\n')}

Output
${helpEntry('--out <file>', 'Output video. [named after the selection]')}

Examples
  wornways render --from 2026-10 --to 2026-10
  wornways render --from 2026 --to 2026 --group all --group-pace real
  wornways render --from 2026-08-01 --to 2026-08-14 --group day --share distance
  wornways render --activity 1234567890
  wornways render ~/Downloads/export.zip --from 2026-10 --to 2026-10

A period names whole days, months or years: --from 2026-10 --to 2026-10 is October 2026.
Selecting exactly one activity plays it at its own pace with live time and distance.
Map tiles come from openfreemap.org and are cached in ~/.cache/wornways.`;

// ---------------------------------------------------------------------------------------
// The render command

async function render(argv: string[]): Promise<void> {
  const settingFlags = Object.fromEntries(
    SETTINGS.map((s) => [
      s.name,
      { type: s.kind.type === 'switch' ? ('boolean' as const) : ('string' as const) },
    ]),
  );
  const parsed = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      ...settingFlags,
      'activity-id': { type: 'string', multiple: true },
      out: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  const positionals = parsed.positionals;
  // The flags are built from the settings table, so their names are only known as text.
  const literalIds = parsed.values['activity-id'];
  const values: Record<string, string | boolean | string[] | undefined> = parsed.values;
  if (values['help']) return void console.log(RENDER_HELP);
  const tStart = performance.now();

  const out = typeof values['out'] === 'string' ? values['out'] : undefined;

  const input: SettingsInput = {};
  for (const setting of SETTINGS) input[setting.name] = values[setting.name];
  if (literalIds) {
    const listed =
      typeof input.activity === 'string'
        ? input.activity
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
        : [];
    input.activity = [...listed, ...literalIds];
  }
  let settings: RenderSettings;
  try {
    settings = parseSettings(input);
  } catch (error) {
    if (error instanceof SettingsError) fail(`--${error.setting} ${error.message}`);
    throw error;
  }

  const loaded = await loadTracks(positionals, settings);
  const tracks = loaded.tracks;
  const single = tracks.length === 1 ? tracks[0] : null;
  if (single)
    console.log(
      `Activity   ${isoDay(single.startTime)}  ${oneLine(single)}  (id ${single.id}, ${(trackLengthM(single) / 1000).toFixed(1)} km, ${single.sport})`,
    );

  const tSetup = performance.now();
  const replay = await prepareReplay(tracks, settings, {
    createCanvas: (w, h) => createCanvas(w, h) as unknown as CanvasLike,
    loadTiles: createTileLoader({ cache: fileTileCache(tileCacheDir()), userAgent: USER_AGENT }),
  });
  const setupMs = performance.now() - tSetup;
  const { plan } = replay;
  console.log(`Pace       ${plan.note}: ${Number(plan.timeline.duration.toFixed(1))} s video`);
  describeReplay(replay);

  const file = out ?? videoFileName(tracks, settings);
  const { drawMs, encodeMs } = await writeVideo(replay, file);
  describeTimings(replay, file, {
    read: loaded.readMs,
    activities: loaded.activities,
    clean: loaded.cleanMs,
    setup: setupMs,
    draw: drawMs,
    encode: encodeMs,
    total: performance.now() - tStart,
  });
}

/** A short message for what went wrong, e.g. for a flag that does not exist. */
function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const unknownFlag = /^Unknown option '(-[^']*)'/.exec(error.message);
  if (unknownFlag) return `unknown flag ${unknownFlag[1]}; run "wornways --help"`;
  return error.message;
}

const HELP = `wornways <command> [arguments] [flags]

Turns GPS activities into heatmap replay videos.

Commands
${helpEntry('import <path>...', 'Add activity files, folders or account export ZIPs (Strava, Garmin) to your library.')}
${helpEntry('list', 'List the activities in your library.')}
${helpEntry('render [<path>...]', 'Make a video of the activities in your library, or of the files named.')}
${helpEntry('delete <id>...', 'Delete activities from your library.')}
${helpEntry('delete-all', 'Delete every activity in your library.')}

Run "wornways <command> --help" for its flags. The library is kept in
${libraryFolder()} ($WORNWAYS_HOME/library when set).`;

const COMMANDS: Record<string, (argv: string[]) => Promise<void>> = {
  import: importCommand,
  list: listCommand,
  render,
  delete: deleteCommand,
  'delete-all': deleteAllCommand,
};

const [command, ...rest] = process.argv.slice(2);
const run = command && Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
if (run) {
  run(rest).catch((error) => fail(errorMessage(error)));
} else {
  console.log(HELP);
  process.exit(!command || command === '--help' || command === 'help' ? 0 : 1);
}
