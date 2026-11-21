// The demo's activities: made-up rides and runs on real roads in Mallorca, shipped with the
// app as an export file and held in memory while the demo is open. They never go into the
// person's own library.

import { importFiles } from '@wornways/engine';
import { Library } from './library.ts';

/** Built by `npm run demo-routes`. */
const DEMO_URL = '/demo/mallorca.zip';

/** The demo could not be loaded, e.g. while offline before it was ever opened. */
export class DemoUnavailable extends Error {
  constructor() {
    super('The demo could not be loaded. Check your connection and try again.');
  }
}

/** Reads the demo's activities into a library of their own. */
export async function openDemo(): Promise<Library> {
  const response = await fetch(DEMO_URL).catch(() => null);
  if (!response?.ok) throw new DemoUnavailable();
  const data = new Uint8Array(await response.arrayBuffer());
  const { activities } = await importFiles([
    {
      name: 'mallorca.zip',
      size: data.length,
      read: async (offset, length) => data.subarray(offset, offset + length),
    },
  ]);
  return Library.inMemory(activities);
}
