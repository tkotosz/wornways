# Working on Wornways

## Commands

- `npm test`: unit tests (Vitest), reads workspace packages from source.
- `npm run test:web`: browser tests of the web app in Chromium (Playwright), against a
  built preview; map tiles are answered offline.
- `npm run dev:web`: the local Pages preview with Strava and Ride with GPS configured through
  `.dev.vars` (their origins too, `http://127.0.0.1:8788`).
  After finishing an implementation task, verify the preview loads with the latest changes,
  leave it running for review, and share its URL in the final response.
- `npm run dev:web:vite`: the Vite dev server for file-based replays.
- `npm run dev:phone`: the built web app over HTTPS on the local network, for trying it on
  a phone (see the README).
- `npm run lint` / `npm run format`: ESLint and Prettier.
- `npm run demo-routes`: rebuilds the web app's demo activities
  (`apps/web/public/demo/mallorca.zip`) from map tiles; the same map data gives the same file.
- `npm run icons`: draws the web app's PNG icons from the SVG marks in
  `apps/web/public/icons/`.
- `npm run build`: TypeScript project build.
- `npm run cli -- <command>`: run the CLI from source (`import`, `list`, `render`,
  `delete`, `delete-all`); `npm run cli -- --help` lists them, `<command> --help` the flags.
  Tests and experiments set `WORNWAYS_HOME` to a temporary folder, so they never touch
  the real library in `~/.wornways`.

## Where things are

| Path                      | What                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `packages/engine`         | Platform-neutral core: import, cleaning, timeline, camera, map, rendering                   |
| `apps/cli`                | Command-line tool for developers: import files, render a video                              |
| `apps/web`                | The web app: Vue page in `src/`, all heavy work in `src/worker/`, browser tests in `tests/` |
| `docs/architecture.md`    | Structure and key decisions                                                                 |
| `docs/render-settings.md` | Every render setting: values and defaults                                                   |
| `docs/skipped-features/`  | Features left out on purpose: why, and what would change that                               |

## Rules

- The engine imports nothing platform-specific (no `node:*`, no DOM). Anything that needs
  the outside world is a small interface the app passes in.
- Keep it simple: plain functions and types, folders by topic, one file per use case.
  Add structure only when its absence hurts.
- Tests live in each package's `tests/` folder, mirroring `src/`.
- Never commit personal activity data or rendered videos; `data/` and `out/` are
  git-ignored. Test data is generated.
