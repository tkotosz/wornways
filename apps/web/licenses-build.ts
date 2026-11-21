// Completes the license list Vite writes into the build (build.license): what Wornways is
// and what it is built on, then the packages Vite lists for the page, then the ones only
// the worker bundles. Vite builds the worker separately and leaves its packages out, so
// they are named here: the worker imports Mediabunny and the engine, which is Wornways.
// Vite writes its list in its last build steps, so the file is completed once written.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

export const LICENSES_FILE = 'licenses.txt';

/** Packages bundled only into the worker; their own dependencies are types only. */
const WORKER_PACKAGES = ['mediabunny'];

const root = (path: string) => new URL(`../../${path}`, import.meta.url);

const ABOUT = `Wornways
========

Wornways is open source under the MIT license; the source is at
https://github.com/tkotosz/wornways.

${readFileSync(root('LICENSE'), 'utf8')}
Built on
--------

- Parts of the engine (reading FIT files, cleaning tracks, the race clock's speed curve)
  are based on strava-home-runs, https://github.com/AlFontal/strava-home-runs, MIT
  license; see THIRD_PARTY_NOTICES.md in the source.
- Videos are drawn with the Inter font, https://github.com/rsms/inter, SIL Open Font
  License 1.1, in full at /fonts/Inter-LICENSE.txt.
- Map data: OpenFreeMap, © OpenMapTiles, data from OpenStreetMap contributors.
- Demo activities: made-up routes drawn along roads from OpenStreetMap data,
  © OpenStreetMap contributors, Open Database License 1.0,
  https://opendatacommons.org/licenses/odbl/1-0/.

`;

export function licenses(): Plugin {
  let outDir = '';
  return {
    name: 'wornways-licenses',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    writeBundle() {
      const path = join(outDir, LICENSES_FILE);
      const fromVite = readFileSync(path, 'utf8');
      const worker = WORKER_PACKAGES.map((name) => {
        const { version, license } = JSON.parse(
          readFileSync(root(`node_modules/${name}/package.json`), 'utf8'),
        ) as { version: string; license: string };
        const text = readFileSync(root(`node_modules/${name}/LICENSE`), 'utf8');
        return `## ${name} - ${version} (${license})\n\n${text.trim()}\n`;
      });
      writeFileSync(path, `${ABOUT}${fromVite.trim()}\n\n${worker.join('\n')}`);
    },
  };
}
