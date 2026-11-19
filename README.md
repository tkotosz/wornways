# Wornways

[![CI](https://github.com/tkotosz/wornways/actions/workflows/ci.yml/badge.svg)](https://github.com/tkotosz/wornways/actions/workflows/ci.yml)

Turns your GPS activities into a short video: your routes build up as a glowing heatmap
over a street map, ready to post as a story. Everything happens on your own device; your
files are never uploaded.

## What it does

- **Reads your files as they are:** FIT, GPX and TCX files (also `.gz`), a folder of them,
  or the whole account export ZIP from Strava or Garmin, with names and sports from its
  activity list.
- **Lets you choose what to show:** a period (today, yesterday, this month, a custom
  range…), sports, activities that start or end near a place, and any activity ticked or
  unticked by hand.
- **Plays them the way you like,** with presets:
  - **All at once:** every activity starts at the same moment and moves at its real pace,
    with a race clock.
  - **Recap:** one after another, grouped by day, week or month when there are many.
  - **Multiday trip:** one day after another, a longer day getting more time.
  - **Highlight:** a 15-second clip with the camera following a single activity.

  Or fine-tune it: grouping, time share, how a group moves, overlap, drawing pace and the
  camera.

- **Dresses it up:** story, square or landscape frame, a title, metrics (date, time,
  distance, pace, elevation, count) in any of nine positions, a live preview, an end card
  with the Wornways mark.
- **Makes the video in the browser** as an MP4 (H.264), to download or share straight to
  another app on a phone. The web app can be installed and then starts without a network.

The map comes from [OpenFreeMap](https://openfreemap.org) (OpenMapTiles, OpenStreetMap
data). Map tile requests are the only thing that leaves the device: they say which area is
drawn, never the routes.

## Running it

Requires Node 26 (see `.nvmrc`).

```sh
npm install
npm run dev:web      # the web app on http://localhost:5173
```

The web app needs a browser that can encode video: a current Chrome or Edge, Safari 16.4
or later, or Firefox on a computer.

### Command-line tool

The same engine as a command-line tool, for developers and for checking videos frame by
frame. It encodes with `ffmpeg`, which must be on the PATH.

```sh
npm run cli -- import ~/Downloads/export.zip                   # add activities to the library
npm run cli -- list                                            # what the library holds
npm run cli -- render --help                                   # every setting, as flags
npm run cli -- render --from 2026-10 --to 2026-10              # October as a video
npm run cli -- render --preset all-at-once --size square --out out/race.mp4
```

`import` takes activity files, folders of them, or a Strava or Garmin account export ZIP as
it is, and keeps the activities in `~/.wornways/library` (`$WORNWAYS_HOME/library` when
set); `delete` and `delete-all` remove them again. `render` shows the library, or reads the
paths it is given without storing them. Write videos into `out/`, which git ignores.

## Developing

```sh
npm test           # unit tests (Vitest)
npm run test:web   # browser tests of the web app (Playwright; first `npx playwright install chromium`)
npm run lint       # ESLint and Prettier
npm run format     # format everything with Prettier
npm run build      # type-check and build
npm run icons      # redraw the web app's PNG icons after changing an SVG mark
```

Pull requests run the same checks on GitHub, together with code scanning (CodeQL) and a
review of new dependencies; Dependabot keeps dependencies up to date.

- [AGENTS.md](AGENTS.md): how to work on the code.
- [docs/architecture.md](docs/architecture.md): how it is built.
- [docs/render-settings.md](docs/render-settings.md): every setting of a video.
- [docs/web-app.md](docs/web-app.md): the web app's steps and how it works.

### Trying the web app on a phone

The browser makes videos only over HTTPS or on `localhost`. `npm run dev:phone` builds the
app and serves it over HTTPS with a self-signed certificate on the local network; it
prints the address to open on the phone (`https://<this computer's address>:4173/`).

- Accept the certificate warning once on the phone.
- On Android, Chrome may need the "Nearby devices" permission (Settings → Apps → Chrome →
  Permissions) to reach a computer on the local network.
- The phone keeps its own activities and map tiles; add the files on the phone.
- Installing the app and starting it without a network do not work this way: the service
  worker needs a certificate the phone trusts. To try them, connect the phone over USB,
  forward port 4173 in Chrome's `chrome://inspect` (Port forwarding), run
  `npm run build -w @wornways/web && npm run preview -w @wornways/web` and open
  `http://localhost:4173` on the phone.

## Deploying

The web app is a static site on Cloudflare Pages, published by the Deploy workflow
(`.github/workflows/deploy.yml`):

- **Preview:** when CI passes for a push to `main`, the app goes to
  https://preview.wornways.pages.dev.
- **Production:** publishing a GitHub Release puts its tag on https://wornways.pages.dev,
  after the full CI has passed on it. Tags follow semantic versioning (`v0.1.0`; minor for
  features, patch for fixes):

  ```sh
  gh release create v0.1.0 --generate-notes
  ```

  To redeploy or roll back, run the workflow by hand (Actions > Deploy > Run workflow) and
  pick the tag.

The workflow needs the repository secrets `CLOUDFLARE_API_TOKEN` (permission: Account >
Cloudflare Pages > Edit) and `CLOUDFLARE_ACCOUNT_ID`. `apps/web/public/_headers` sets the caching and security
headers, and the build writes `licenses.txt` with the licenses of everything the app
ships.

## License

MIT, see [LICENSE](LICENSE). Parts of the engine are based on MIT-licensed code, and the
web app ships the Inter font; [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) says
exactly what. Report security problems as described in [SECURITY.md](SECURITY.md).
