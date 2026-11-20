import { execFile, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Track } from '@wornways/engine';
import { Library } from '../src/library.ts';

let home: string;
beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'wornways-'));
});
afterEach(() => rm(home, { recursive: true, force: true }));

const track = (id: string, startTime: number, name?: string): Track => ({
  id,
  name,
  sport: 'ride',
  startTime,
  // Two points, the first without elevation.
  points: Float64Array.of(19, 47.5, NaN, 0, 19.01, 47.51, 120.5, 60),
});

describe('Library', () => {
  it('keeps activities for the next run, newest first, elevation gaps included', async () => {
    const library = await Library.open(home);
    await library.put([track('1', 1000, 'Older'), track('garmin-2/x?', 2000)]);

    const reopened = await Library.open(home);
    expect(reopened.all().map((a) => [a.id, a.name, a.sport, a.startTime])).toEqual([
      ['garmin-2/x?', undefined, 'ride', 2000],
      ['1', 'Older', 'ride', 1000],
    ]);
    expect([...reopened.get('1')!.points]).toEqual([19, 47.5, NaN, 0, 19.01, 47.51, 120.5, 60]);
  });

  it('deletes some activities, or all of them', async () => {
    const library = await Library.open(home);
    await library.put([track('1', 1000), track('2', 2000), track('3', 3000)]);

    await library.delete(['2']);
    expect((await Library.open(home)).all().map((a) => a.id)).toEqual(['3', '1']);

    await library.deleteAll();
    expect((await Library.open(home)).size).toBe(0);
  });

  it('keeps activities added through separate, concurrently open libraries', async () => {
    const first = await Library.open(home);
    const second = await Library.open(home);
    await Promise.all([first.put([track('1', 1000)]), second.put([track('2', 2000)])]);
    await first.delete(['1']);

    expect((await Library.open(home)).all().map((a) => a.id)).toEqual(['2']);
    expect(first.all().map((a) => a.id)).toEqual(['2']);
  });
});

describe('the library commands', () => {
  const root = new URL('../../../', import.meta.url).pathname;
  const fixture = (name: string) => path.join(root, 'packages/engine/tests/import/fixtures', name);
  const cli = async (...args: string[]) => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--conditions=source', '--import', 'tsx', 'apps/cli/src/main.ts', ...args],
      { cwd: root, env: { ...process.env, WORNWAYS_HOME: home } },
    );
    return stdout;
  };

  it('imports an account export, lists it and deletes from it', async () => {
    expect(await cli('import', fixture('garmin-export.zip'), fixture('trail-run.tcx'))).toContain(
      'Imported 2 activities; 2 activities in all.',
    );
    expect(await cli('import', fixture('garmin-export.zip'))).toContain(
      'Imported 0 activities, 1 already there; 2 activities in all.',
    );

    const list = await cli('list');
    expect(list).toMatch(/garmin-9001 +\d{4}-\d\d-\d\d +ride +[\d.]+ km +Lakeside loop/);
    expect(list).toContain('2 activities');

    expect(await cli('delete', 'garmin-9001', '--yes')).toContain('Deleted 1 activity.');
    expect(await cli('delete-all', '--yes')).toContain('Deleted 1 activity.');
    expect(await cli('list')).toContain('Your library is empty');
  }, 30_000);

  it('asks before deleting on stderr, keeping stdout for results', async () => {
    await cli('import', fixture('trail-run.tcx'));
    const answered = spawnSync(
      process.execPath,
      ['--conditions=source', '--import', 'tsx', 'apps/cli/src/main.ts', 'delete-all'],
      { cwd: root, env: { ...process.env, WORNWAYS_HOME: home }, input: 'n\n', encoding: 'utf8' },
    );
    expect(answered.stderr).toContain('Delete all 1 activity from your library? [y/N]');
    expect(answered.stdout).toBe('Nothing was deleted.\n');
    expect(await cli('list')).toContain('1 activity');
  }, 30_000);

  it('accepts a distance flag on render and excludes longer activities', async () => {
    const args = ['render', fixture('trail-run.tcx'), '--max-distance=0'];
    await expect(cli(...args)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('Selected   0 activities with GPS'),
      stderr: expect.stringContaining('nothing matches the filters'),
    });
    await expect(cli('constructor')).rejects.toMatchObject({ code: 1, stderr: '' });
  });

  it('imports distinct same-name files concurrently and accepts their literal IDs', async () => {
    const paths = [1, 2].map((day) => path.join(home, String(day), 'my, trip.gpx'));
    for (const [i, file] of paths.entries()) {
      await mkdir(path.dirname(file));
      const date = `2026-11-0${i + 1}`;
      await writeFile(
        file,
        `<gpx><trk><trkseg>
          <trkpt lat="47.5" lon="19"><time>${date}T10:00:00Z</time></trkpt>
          <trkpt lat="47.5" lon="19.005"><time>${date}T10:01:00Z</time></trkpt>
        </trkseg></trk></gpx>`,
      );
    }
    await Promise.all(paths.map((file) => cli('import', file)));
    const list = await cli('list');
    expect(list).toContain('2 activities');
    expect(list).toMatch(/^my, trip-2 /m);
    await expect(
      cli('render', '--activity-id', 'my, trip-2', '--trim-radius=2000'),
    ).rejects.toMatchObject({
      stdout: expect.stringContaining('Selected   1 activities with GPS'),
      stderr: expect.stringContaining('no usable route remains'),
    });
  }, 30_000);
});
