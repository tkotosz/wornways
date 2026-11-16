// Small helpers for what the CLI prints.

import type { Track } from '@wornways/engine';

/** Prints the message as an error and ends the program. */
export function fail(message: string): never {
  console.error(`wornways: ${message}`);
  process.exit(1);
}

export const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

/** YYYY-MM-DD in local time. */
export const isoDay = (ms: number) => new Date(ms).toLocaleDateString('sv');

/** The activity's name (or id) on one line. */
export const oneLine = (t: Track) => (t.name || t.id).replace(/\s+/g, ' ');
