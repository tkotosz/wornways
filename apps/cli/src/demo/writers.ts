// Writing the demo set as a Strava-style export: GPX files, an activities.csv that names
// them, and a ZIP holding everything.

import { crc32, deflateRawSync } from 'node:zlib';
import type { Recorded } from './timing.ts';

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A GPX file of one activity, with each point's height when it has one. */
export function gpxFile(name: string, type: string, start: Date, points: Recorded[]): string {
  const time = (seconds: number) =>
    new Date(start.getTime() + seconds * 1000).toISOString().replace('.000Z', 'Z');
  const rows = points.map(
    (p) =>
      `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">` +
      (p.ele === undefined ? '' : `<ele>${p.ele.toFixed(1)}</ele>`) +
      `<time>${time(p.seconds)}</time></trkpt>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Wornways demo" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><time>${time(0)}</time></metadata>`,
    '  <trk>',
    `    <name>${escapeXml(name)}</name>`,
    `    <type>${escapeXml(type)}</type>`,
    '    <trkseg>',
    ...rows,
    '    </trkseg>',
    '  </trk>',
    '</gpx>',
    '',
  ].join('\n');
}

export type ListedActivity = {
  id: string;
  start: Date;
  name: string;
  /** Strava's activity type, e.g. "Ride" or "Run". */
  type: string;
  seconds: number;
  file: string;
};

/** Strava's "Mar 14, 2026, 9:00:00 AM", in UTC. */
function stravaDate(date: Date): string {
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const hour = date.getUTCHours();
  const clock = `${hour % 12 || 12}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
  return `${month} ${date.getUTCDate()}, ${date.getUTCFullYear()}, ${clock}`;
}

/** The activities.csv of a Strava export, with the columns the importer reads. */
export function activitiesCsv(activities: ListedActivity[]): string {
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = 'Activity ID,Activity Date,Activity Name,Activity Type,Elapsed Time,Filename';
  const rows = activities.map((a) =>
    [a.id, stravaDate(a.start), a.name, a.type, a.seconds, a.file].map(cell).join(','),
  );
  return [header, ...rows, ''].join('\n');
}

/**
 * A ZIP archive of the given files, compressed. Every entry carries the same fixed date, so
 * the same files always give the same bytes.
 */
export function zipFile(files: { path: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  // 2026-01-01 00:00 in MS-DOS date and time.
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const file of files) {
    const name = new TextEncoder().encode(file.path);
    const packed = deflateRawSync(file.data, { level: 9 });
    const crc = crc32(file.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(8, 8, true); // deflate
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, packed.length, true);
    local.setUint32(22, file.data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, packed);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true); // version made by
    entry.setUint16(6, 20, true); // version needed
    entry.setUint16(10, 8, true);
    entry.setUint16(12, dosTime, true);
    entry.setUint16(14, dosDate, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, packed.length, true);
    entry.setUint32(24, file.data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + packed.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of all) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
