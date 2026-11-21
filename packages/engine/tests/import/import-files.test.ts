import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importFiles } from '../../src/import/import-files.ts';
import { listZip, type RandomAccessFile } from '../../src/import/zip.ts';
import { pointCount } from '../../src/track/types.ts';

/** A fixture file, read the way a browser reads a picked file: part by part. */
function fixture(name: string): RandomAccessFile {
  const bytes = new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));
  return file(name, bytes);
}

function file(name: string, bytes: Uint8Array): RandomAccessFile {
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
    // Not in the list, and a TCX file has no name: named after its start and sport.
    expect(byId.get('1003')).toMatchObject({ name: 'Afternoon run' });
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
      ['morning-ride', 'Morning ride', 'ride'],
      ['trail-run', 'Afternoon run', 'run'],
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

  it('imports a valid copy when the first file with its ID is unreadable', async () => {
    const copy = { ...fixture('broken.gpx'), name: 'backup/morning-ride.gpx' };
    const result = await importFiles([copy, fixture('morning-ride.gpx')]);
    expect(result.activities.map(({ id }) => id)).toEqual(['morning-ride']);
    expect(result.unreadable).toHaveLength(1);
  });

  it('keeps distinct same-name activities on a later import and deduplicates reimports', async () => {
    const ride = { ...fixture('morning-ride.fit'), name: 'trip.fit' };
    const run = { ...fixture('trail-run.tcx'), name: 'trip.tcx' };
    const first = await importFiles([ride]);
    const known = new Map(first.activities.map((a) => [a.id, a]));
    const second = await importFiles([run], { known });
    expect(second.activities.map(({ id, sport }) => [id, sport])).toEqual([['trip-2', 'run']]);
    known.set(second.activities[0].id, second.activities[0]);
    const repeated = await importFiles([ride, run], { known });
    expect(repeated.activities).toEqual([]);
    expect(repeated.duplicates).toBe(2);
  });

  it('matches loose export indexes by path and leaves other files with the same basename alone', async () => {
    const ride = { ...fixture('morning-ride.gpx'), name: 'export/activities/workout.gpx' };
    const other = { ...fixture('trail-run.tcx'), name: 'other/activities/workout.tcx' };
    const csv = file(
      'export/activities.csv',
      new TextEncoder().encode(
        'Activity ID,Activity Name,Activity Type,Filename\n123,Sunday ride,Ride,activities/workout.gpx\n444,Other ride,Ride,activities/workout.tcx',
      ),
    );
    const result = await importFiles([csv, ride, other]);
    expect(result.activities.map(({ id, name, sport }) => [id, name, sport])).toEqual([
      ['123', 'Sunday ride', 'ride'],
      ['workout', 'Afternoon run', 'run'],
    ]);
  });
  it('leaves out an activity the caller knows already', async () => {
    const result = await importFiles([fixture('morning-ride.gpx')], { isKnown: () => true });

    expect(result.activities).toEqual([]);
    expect(result.duplicates).toBe(1);
  });

  describe('a Garmin account export', () => {
    // garmin-export.zip: an activity list in DI-Connect-Fitness, a profile file, and a ZIP
    // file inside with three FIT files named after an email address: a ride listed as
    // "Lakeside loop", an indoor ride without positions, and a daily monitoring file.

    it('reads the activities of the ZIP file inside, named and typed by the activity list', async () => {
      const result = await importFiles([fixture('garmin-export.zip')]);

      expect(result.activities.map((a) => [a.id, a.name, a.sport])).toEqual([
        ['garmin-9001', 'Lakeside loop', 'ride'],
      ]);
      // The indoor ride, without the email address in its name.
      expect(result.withoutGps).toEqual(['2002.fit']);
      // The profile and the monitoring file.
      expect(result.ignored).toBe(2);
      expect(result.unreadable).toEqual([]);
    });

    it('names the same ride in another file after the list, and reads it once', async () => {
      // The ride of the export, also as a GPX file, e.g. from another service's export.
      const result = await importFiles([fixture('morning-ride.gpx'), fixture('garmin-export.zip')]);

      expect(result.activities.map((a) => [a.id, a.name])).toEqual([
        ['garmin-9001', 'Lakeside loop'],
      ]);
      expect(result.duplicates).toBe(1);
    });

    it('takes the id of a file without its export from the file name, without the email address', async () => {
      const ride = fixture('morning-ride.fit');
      const result = await importFiles([{ ...ride, name: 'someone@example.com_3001.fit' }]);

      expect(result.activities.map((a) => [a.id, a.name])).toEqual([['3001', 'Morning ride']]);
    });

    it('skips activities known by their Garmin id, keeping their list name and sport', async () => {
      const result = await importFiles([fixture('garmin-export.zip')], {
        skip: (id) => id === 'garmin-9001',
      });

      expect(result.activities).toEqual([]);
      expect(result.skipped).toBe(1);
      expect(result.listedSkipped).toEqual([
        { id: 'garmin-9001', name: 'Lakeside loop', sport: 'ride' },
      ]);
    });

    it('keeps an activity whose file name already equals the Garmin ID', async () => {
      const ride = { ...fixture('morning-ride.gpx'), name: 'garmin-9001.gpx' };
      const result = await importFiles([ride, fixture('garmin-export.zip')]);
      expect(result.activities.map(({ id, name }) => [id, name])).toEqual([
        ['garmin-9001', 'Lakeside loop'],
      ]);
      expect(result.duplicates).toBe(1);
    });
  });

  it('reports its progress', async () => {
    const seen: string[] = [];
    await importFiles([fixture('strava-export.zip')], {
      onProgress: ({ done, total }) => seen.push(`${done}/${total}`),
    });

    expect(seen).toEqual(['0/3', '1/3', '2/3', '3/3']);
  });
});
