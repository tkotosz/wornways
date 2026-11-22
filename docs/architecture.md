# Architecture

## Bird's-eye view

Activity files (FIT, GPX, TCX, a Strava export) go in; a replay video comes out. All work
runs on the user's device: in a browser Web Worker for the web app, in Node for the CLI.

## Codemap

- `packages/engine`: the core. Topic folders: `import/` (file readers), `track/`
  (cleaning, place filters), `replay/` (timeline, camera, heat colors, renderer), `map/`
  (vector tiles, basemap drawing). Use cases are one file each, exporting a function;
  long-running ones report progress through async generators.
  `replay/settings.ts` describes every render setting once (values, default); front ends
  build their flags or controls from that table.
  `track/select.ts` chooses and cleans the activities for the settings, and
  `replay/prepare.ts` sets up a replay (pacing, camera, map, renderer); front ends draw its
  frames in order and encode them. `map/tiles.ts` downloads map tiles into a cache the
  front end provides.
- `apps/cli`: `import`, `list`, `delete` and `delete-all` keep an activity library on
  disk (`library.ts`, `library-commands.ts`); `render` makes a video. `main.ts` turns flags
  into settings, `load.ts` reads the library or the files named and selects the
  activities, `video.ts` draws the frames and encodes them, `tiles.ts` keeps map tiles on
  disk.
- `apps/web`: the web app. The Vue page (`src/`) only shows steps and sends requests; one
  Web Worker (`src/worker/`) keeps the activities and makes videos with the engine,
  drawing on `OffscreenCanvas` and encoding with WebCodecs through Mediabunny.
  `src/messages.ts` lists every message between the two. `src/service-worker.js` keeps the
  app's files for starting without a network; `service-worker-build.ts` writes it into the
  build with the list of those files. `licenses-build.ts` completes the list of the licenses
  of what the app ships (`licenses.txt`). `version-build.ts` works out the version shown
  in the header: the release tag for a release build, otherwise branch · commit from git.

## Invariants

- Dependencies point inward: apps → engine. The engine imports nothing platform-specific.
- The web page never does heavy work; everything that reads files or draws runs in the worker.
- GPS points and other hot paths use typed arrays.

## Key decisions

- One table of render settings in the engine drives the CLI flags, their help and their
  validation, so a setting is added in one place. See [render-settings.md](render-settings.md).
- TypeScript (strict, ES modules) in an npm workspaces monorepo: one core shared by
  several front ends.
- Workspace packages resolve from source in development (a `source` export condition):
  no watch build needed.
