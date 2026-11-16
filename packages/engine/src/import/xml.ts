import type { ParsedActivity } from '../track/types.ts';
import { sportSlug } from './index-csv.ts';

// GPX and TCX are read with tolerant pattern scans rather than a full XML parser: the
// engine only needs trackpoints, and Strava exports have been seen with leading whitespace
// that strict parsers reject.

const GPX_SPORTS: Record<string, string> = {
  cycling: 'ride',
  biking: 'ride',
  running: 'run',
  walking: 'walk',
  hiking: 'hike',
  // Older Strava exports write a numeric activity type.
  '1': 'ride',
  '9': 'run',
  '10': 'walk',
  '4': 'hike',
};

function decode(data: Uint8Array): string {
  return new TextDecoder('utf-8').decode(data);
}

function inner(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`).exec(block);
  return m ? m[1].trim() : null;
}

/** Text with XML's character references turned back into characters. */
function unescape(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, code: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (code[0] !== '#') return named[code.toLowerCase()]!;
    return String.fromCodePoint(
      code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)),
    );
  });
}

/** The activity's name: the track's own, else the file's. */
function gpxName(text: string): string | undefined {
  const track = /<trk\b[\s\S]*?(?=<trkseg\b|<\/trk>)/.exec(text)?.[0] ?? '';
  const metadata = /<metadata\b[\s\S]*?<\/metadata>/.exec(text)?.[0] ?? '';
  const name = inner(track, 'name') || inner(metadata, 'name');
  return name ? unescape(name) : undefined;
}

function build(sport: string, rows: number[]): ParsedActivity | null {
  const n = rows.length / 4;
  if (n < 2) return null;
  const t0 = rows[3];
  const points = new Float64Array(rows);
  for (let i = 0; i < n; i++) points[i * 4 + 3] = (points[i * 4 + 3] - t0) / 1000;
  return { sport, startTime: t0, points };
}

export function parseGpx(data: Uint8Array): ParsedActivity | null {
  const text = decode(data);
  if (!/<gpx[\s>]/.test(text)) throw new Error('not a GPX file');
  const type = inner(text, 'type') ?? '';
  const sport = GPX_SPORTS[type.toLowerCase()] ?? (sportSlug(type) || 'unknown');

  const rows: number[] = [];
  const re = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const lat = /\blat\s*=\s*["']([^"']+)["']/.exec(m[1]);
    const lon = /\blon\s*=\s*["']([^"']+)["']/.exec(m[1]);
    const time = inner(m[2], 'time');
    if (!lat || !lon || !time) continue;
    const ms = Date.parse(time);
    const la = Number(lat[1]);
    const lo = Number(lon[1]);
    if (!Number.isFinite(ms) || !Number.isFinite(la) || !Number.isFinite(lo)) continue;
    const ele = inner(m[2], 'ele');
    rows.push(lo, la, ele === null ? NaN : Number(ele), ms);
  }
  const parsed = build(sport, rows);
  const name = gpxName(text);
  return parsed && name ? { ...parsed, name } : parsed;
}

export function parseTcx(data: Uint8Array): ParsedActivity | null {
  const text = decode(data);
  if (!/<TrainingCenterDatabase[\s>]/.test(text)) throw new Error('not a TCX file');
  const tcxSport = /<Activity\b[^>]*\bSport\s*=\s*["']([^"']+)["']/.exec(text)?.[1] ?? '';
  const sport = GPX_SPORTS[tcxSport.toLowerCase()] ?? (sportSlug(tcxSport) || 'unknown');

  const rows: number[] = [];
  const re = /<Trackpoint\b[^>]*>([\s\S]*?)<\/Trackpoint>/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const time = inner(m[1], 'Time');
    const lat = inner(m[1], 'LatitudeDegrees');
    const lon = inner(m[1], 'LongitudeDegrees');
    if (!time || !lat || !lon) continue;
    const ms = Date.parse(time);
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(ms) || !Number.isFinite(la) || !Number.isFinite(lo)) continue;
    const ele = inner(m[1], 'AltitudeMeters');
    rows.push(lo, la, ele === null ? NaN : Number(ele), ms);
  }
  return build(sport, rows);
}
