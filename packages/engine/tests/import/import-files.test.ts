import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importFiles } from '../../src/import/import-files.ts';
import { listZip, type RandomAccessFile } from '../../src/import/zip.ts';
import { pointCount } from '../../src/track/types.ts';

/** A fixture file, read the way a browser reads a picked file: part by part. */
function fixture(name: string): RandomAccessFile {
  const bytes = new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));
  return {
    name,
    size: bytes.length,
    read: async (offset, length) => bytes.slice(offset, offset + length),
  };
}

describe('listZip', () => {
  it('lists the files of an archive', async () => {
    const entries = await listZip(fixture('strava-export.zip'));

    expect(entries.map((e) => e.path)).toEqual([
      'activities.csv',
      'activities/1001.fit.gz',
      'activities/1002.gpx',
      'activities/1003.tcx',
      'media/photo.jpg',
    ]);
  });

  it('rejects a file that is not an archive', async () => {
    await expect(listZip(fixture('broken.zip'))).rejects.toThrow('not a ZIP file');
  });
});

describe('importFiles', () => {
  it('reads an account export with the names and sports of its activity list', async () => {
    const result = await importFiles([fixture('strava-export.zip')]);
    const byId = new Map(result.activities.map((a) => [a.id, a]));

    expect([...byId.keys()]).toEqual(['1001', '1002', '1003']);
    expect(byId.get('1001')).toMatchObject({ name: 'Balaton loop, windy', sport: 'ride' });
    expect(byId.get('1002')).toMatchObject({ name: 'Zwift in Watopia', sport: 'virtual-ride' });
    // Not in the list, and a TCX file has no name: named after its file.
    expect(byId.get('1003')).toMatchObject({ name: '1003' });
    expect(pointCount(byId.get('1001')!)).toBeGreaterThan(100);
    expect(result.ignored).toBe(1); // the photo
    expect(result.unreadable).toEqual([]);
  });

  it('reads single files and reports the ones it cannot use', async () => {
    const result = await importFiles([
      fixture('morning-ride.fit'),
      fixture('trail-run.tcx'),
      fixture('no-gps-data.gpx'),
      fixture('broken.fit'),
      fixture('broken.zip'),
    ]);

    expect(result.activities.map((a) => [a.id, a.name, a.sport])).toEqual([
      ['morning-ride', 'morning-ride', 'ride'],
      ['trail-run', 'trail-run', 'run'],
    ]);
    expect(result.withoutGps).toEqual(['no-gps-data.gpx']);
    expect(result.unreadable).toEqual([
      { file: 'broken.zip', reason: 'not a ZIP file' },
      { file: 'broken.fit', reason: 'not a FIT file' },
    ]);
  });

  it('leaves out the activities it is told to skip, and reads each activity once', async () => {
    const result = await importFiles([fixture('strava-export.zip'), fixture('strava-export.zip')], {
      skip: (id) => id === '1002',
    });

    expect(result.activities.map((a) => a.id)).toEqual(['1001', '1003']);
    expect(result.skipped).toBe(1);
    expect(result.listedSkipped).toEqual([
      { id: '1002', name: 'Zwift in Watopia', sport: 'virtual-ride' },
    ]);
  });

  it('leaves out the planned routes of an account export', async () => {
    const route = fixture('morning-ride.gpx');
    const result = await importFiles([{ ...route, name: 'export/routes/morning-ride.gpx' }]);

    expect(result.activities).toEqual([]);
    expect(result.ignored).toBe(1);
  });

  it('names an activity after the name in its GPX file', async () => {
    const result = await importFiles([fixture('morning-ride.gpx')]);

    expect(result.activities[0]).toMatchObject({ id: 'morning-ride', name: 'Morning ride' });
  });

  it('takes the same activity in two files for one', async () => {
    // One ride, as a FIT file and as a GPX file under another name.
    const gpx = fixture('morning-ride.gpx');
    const result = await importFiles([fixture('morning-ride.fit'), { ...gpx, name: 'ride.gpx' }]);

    expect(result.activities.map((a) => a.id)).toEqual(['morning-ride']);
    expect(result.duplicates).toBe(1);
  });

  it('leaves out an activity the caller knows already', async () => {
    const result = await importFiles([fixture('morning-ride.gpx')], { isKnown: () => true });

    expect(result.activities).toEqual([]);
    expect(result.duplicates).toBe(1);
  });

  it('reports its progress', async () => {
    const seen: string[] = [];
    await importFiles([fixture('strava-export.zip')], {
      onProgress: ({ done, total }) => seen.push(`${done}/${total}`),
    });

    expect(seen).toEqual(['0/3', '1/3', '2/3', '3/3']);
  });
});
