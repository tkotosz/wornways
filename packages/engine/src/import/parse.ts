import { parseFit } from './fit.ts';
import type { ParsedActivity } from '../track/types.ts';
import { parseGpx, parseTcx } from './xml.ts';

export type ActivityFormat = 'fit' | 'gpx' | 'tcx';

/** Format from a filename such as `123.fit` or `123.fit.gz`; null when it is not an activity file. */
export function formatFromFilename(name: string): ActivityFormat | null {
  const m = /\.(fit|gpx|tcx)(\.gz)?$/i.exec(name);
  return m ? (m[1].toLowerCase() as ActivityFormat) : null;
}

/** Parses uncompressed file bytes. Returns null for activities with no usable position data. */
export function parseActivity(data: Uint8Array, format: ActivityFormat): ParsedActivity | null {
  switch (format) {
    case 'fit':
      return parseFit(data);
    case 'gpx':
      return parseGpx(data);
    case 'tcx':
      return parseTcx(data);
  }
}
