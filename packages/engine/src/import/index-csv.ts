// Reader for `activities.csv` from a Strava account export: the index that maps each
// activity to its file, sport type, name and date.

export type IndexEntry = {
  id: string;
  name: string;
  /** Slug of Strava's activity type: "Virtual Ride" becomes "virtual-ride". */
  sport: string;
  /** Epoch milliseconds, or NaN when the date could not be read. */
  startTime: number;
  /** Path relative to the export root, e.g. "activities/123.fit.gz". Empty for manual entries. */
  filename: string;
};

/**
 * The one way sports are named: lower case, words joined by hyphens. Strava's activity
 * list writes "Alpine Ski" and "E-Bike Ride", its GPX files "AlpineSki" and "EBikeRide";
 * all become "alpine-ski" and "e-bike-ride".
 */
export function sportSlug(name: string): string {
  return name
    .trim()
    .replace(/([a-z\d])([A-Z])/g, '$1-$2') // "AlpineSki" → "Alpine-Ski"
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2') // "EBike" → "E-Bike"
    .toLowerCase()
    .replace(/[\s_-]+/g, '-');
}

/** RFC 4180 CSV: quoted fields may contain commas, doubled quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Strava writes dates like "Oct 31, 2026, 8:56:21 AM", in UTC. */
function parseStravaDate(s: string): number {
  const m = /^(\w{3})\w*\s+(\d{1,2}),\s*(\d{4}),?\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i.exec(
    s.trim(),
  );
  if (!m) return Date.parse(s);
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return NaN;
  let hour = Number(m[4]);
  if (m[7]) hour = (hour % 12) + (m[7].toUpperCase() === 'PM' ? 12 : 0);
  return Date.UTC(Number(m[3]), month, Number(m[2]), hour, Number(m[5]), Number(m[6]));
}

export function parseActivitiesIndex(csvText: string): IndexEntry[] {
  const rows = parseCsv(csvText.replace(/^\uFEFF/, ''));
  const header = rows[0];
  if (!header) return [];
  // Some column names repeat ("Elapsed Time", "Distance"); the ones used here do not.
  const col = (name: string) => header.indexOf(name);
  const [id, date, name, type, file] = [
    'Activity ID',
    'Activity Date',
    'Activity Name',
    'Activity Type',
    'Filename',
  ].map(col);
  if (id < 0 || type < 0 || file < 0) throw new Error('activities.csv: expected columns not found');
  return rows
    .slice(1)
    .filter((r) => r.length > file)
    .map((r) => ({
      id: r[id]?.trim() ?? '',
      name: r[name] ?? '',
      sport: sportSlug(r[type] ?? ''),
      startTime: parseStravaDate(r[date] ?? ''),
      filename: r[file].trim(),
    }));
}
