// Map tiles kept on disk between runs, in the user's cache folder.

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TileCache } from '@wornways/engine';

/** The folder the CLI keeps map tiles in: ~/.cache/wornways/tiles, or under XDG_CACHE_HOME. */
export function tileCacheDir(): string {
  return path.join(
    process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'),
    'wornways',
    'tiles',
  );
}

/** Keeps each cache key as a file under `dir`. */
export function fileTileCache(dir: string): TileCache {
  return {
    async read(key) {
      try {
        return new Uint8Array(await readFile(path.join(dir, key)));
      } catch {
        return undefined;
      }
    },
    async write(key, data) {
      const file = path.join(dir, key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, data);
    },
    async keepOnly(topLevelNames) {
      const names = await readdir(dir).catch(() => [] as string[]);
      for (const name of names)
        if (!topLevelNames.includes(name))
          await rm(path.join(dir, name), { recursive: true, force: true });
    },
  };
}
