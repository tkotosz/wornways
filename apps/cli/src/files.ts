// The files named on the command line, read the way the engine's import reads files.

import { existsSync } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { RandomAccessFile } from '@wornways/engine';
import { fail } from './terminal.ts';

/** A file on disk, read part by part, so a large archive is never read whole. */
async function diskFile(file: string): Promise<RandomAccessFile> {
  const { size } = await stat(file);
  return {
    name: file.split(path.sep).join('/'),
    size,
    read: async (offset, length) => {
      const handle = await open(file);
      try {
        const bytes = new Uint8Array(length);
        const { bytesRead } = await handle.read(bytes, 0, length, offset);
        return bytes.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    },
  };
}

/**
 * The files to read for these paths: each file named, and every file in a folder named, its
 * subfolders included. A folder without an activities.csv also takes the one next to it, as
 * for the "activities" folder of an unpacked Strava export.
 */
export async function filesAt(paths: string[]): Promise<RandomAccessFile[]> {
  const files: string[] = [];
  for (const given of paths) {
    const full = path.resolve(given);
    if (!existsSync(full)) fail(`not found: ${full}`);
    if (!(await stat(full)).isDirectory()) {
      files.push(full);
      continue;
    }
    const inside = (await readdir(full, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name))
      .sort();
    files.push(...inside);
    const listNextTo = path.join(full, '..', 'activities.csv');
    if (!inside.some((file) => path.basename(file) === 'activities.csv') && existsSync(listNextTo))
      files.push(listNextTo);
  }
  return Promise.all([...new Set(files)].map(diskFile));
}
