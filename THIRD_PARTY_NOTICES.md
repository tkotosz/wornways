# Third-party notices

Wornways reuses code from one project, ships one font made by others, and ships demo
activities drawn from OpenStreetMap data. This file says exactly what, and carries the
licenses that ask to be passed on.

## strava-home-runs

- Source: https://github.com/AlFontal/strava-home-runs
- License: MIT (below)
- What is based on its code:
  - **Reading FIT files** (`packages/engine/src/import/fit.ts`): the reader for definition
    and data messages, compressed timestamp headers, skipped developer fields and chained
    files. Wornways added altitude, the full table of FIT sports and the sport naming.
  - **Cleaning a track** (`packages/engine/src/track/clean.ts`, `cleanTrack`): dropping GPS
    spikes faster than a sport's plausible top speed, capping pauses at three times the
    median sampling interval, and thinning points to a spacing.
  - **The race clock's speed curve** (`packages/engine/src/replay/timeline.ts`,
    `raceTimeline`): the clock that starts slowly and speeds up exponentially when every
    activity plays at once. Racing within each group of activities is Wornways' own.
- Everything else in Wornways is its own code.

```text
MIT License

Copyright (c) 2026 Alejandro Fontal

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Inter

- Source: https://github.com/rsms/inter (version 4.1)
- Used in: the web app draws the text of its videos with it
  (`apps/web/public/fonts/InterVariable.woff2`).
- License: SIL Open Font License 1.1, in full in `apps/web/public/fonts/Inter-LICENSE.txt`.

## OpenStreetMap data

- Source: OpenStreetMap, through the OpenMapTiles vector tiles served by OpenFreeMap.
- Used in: the web app's demo activities (`apps/web/public/demo/mallorca.zip`), made-up
  routes drawn along its roads by `npm run demo-routes`.
- License: © OpenStreetMap contributors, available under the Open Database License (ODbL)
  1.0, https://opendatacommons.org/licenses/odbl/1-0/. The demo activities are published
  under the same license; the ZIP's `README.txt` says so too.
