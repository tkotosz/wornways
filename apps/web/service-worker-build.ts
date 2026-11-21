// Writes the service worker into the build as sw.js: src/service-worker.js, with the list of
// the app's files and a version in front of it (see that file for what it does with them).

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const SOURCE = new URL('./src/service-worker.js', import.meta.url);

/** Files in public/ that tell the host how to serve the others, not served themselves. */
const HOST_FILES = new Set(['_headers', '_routes.json']);
/** Folders in public/ fetched only when needed, such as the demo's activities. */
const ON_DEMAND = ['demo/'];

export function serviceWorker(): Plugin {
  let base = '/';
  let publicDir = '';
  return {
    name: 'wornways-service-worker',
    apply: 'build',
    // After Vite's own plugins, so the page and the workers' files are in the bundle.
    enforce: 'post',
    configResolved(config) {
      base = config.base;
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const files = new Map<string, string | Uint8Array>();
      for (const [name, item] of Object.entries(bundle))
        files.set(name, item.type === 'chunk' ? item.code : item.source);
      for (const name of readdirSync(publicDir, { recursive: true, encoding: 'utf8' })) {
        const path = join(publicDir, name);
        // Rules for the host (Cloudflare Pages) are never served, so they cannot be stored.
        if (HOST_FILES.has(name)) continue;
        if (ON_DEMAND.some((folder) => name.startsWith(folder))) continue;
        if (statSync(path).isFile()) files.set(name, readFileSync(path));
      }

      const names = [...files.keys()].sort();
      const hash = createHash('sha256');
      for (const name of names) hash.update(name).update(files.get(name)!);
      const version = hash.digest('hex').slice(0, 16);

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source:
          `const VERSION = ${JSON.stringify(version)};\n` +
          `const FILES = ${JSON.stringify(names.map((name) => base + name))};\n\n` +
          readFileSync(SOURCE, 'utf8'),
      });
    },
  };
}
