# Wornways

[![CI](https://github.com/tkotosz/wornways/actions/workflows/ci.yml/badge.svg)](https://github.com/tkotosz/wornways/actions/workflows/ci.yml)

Turns your GPS activities into a short video: your routes build up as a glowing heatmap
over a street map, ready to post as a story. Wornways makes videos on your device.
Activity files you add stay there.

## What it does

- **Reads your files as they are:** FIT, GPX and TCX files (also `.gz`), a folder of them,
  or the whole account export ZIP from Strava or Garmin, with names and sports from its
  activity list.
- **Connects to Strava** on deployments where it is configured. Pick a date range and
  activities to replay. Wornways can restore your connection and downloaded tracks
  after a reload for up to two hours.
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
data). Tile requests tell the map provider which area is drawn. With Strava, Wornways
also connects to Strava for sign-in and to read the athlete's selected activities.

## Running it

Requires Node 26 (see `.nvmrc`).

```sh
npm install
npm run dev:web      # local Pages preview with optional Strava on http://127.0.0.1:8788
npm run dev:web:vite # file-only development with hot reload on http://localhost:5173
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
- **PR preview:** after CI passes on a same-repo PR to `main`, the repository owner can
  comment `/preview`. The workflow posts `https://pr-<number>.wornways.pages.dev` on
  the PR. Run `/preview` again after a push to update that URL. Closing or merging the PR,
  or commenting `/preview delete`, removes its deployments and marks the link as expired.
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

### Enabling Connect with Strava

The Source screen offers Strava when the deployment has the OAuth credentials and
the event relay binding. The ordinary Vite server and on-demand PR previews serve
the file workflow. For local OAuth testing, use Wrangler Pages dev. Strava lets only 10
athletes connect until it reviews the app; see
[docs/skipped-features/strava-limits.md](docs/skipped-features/strava-limits.md) for the
limits and the costs.

1. Register a [Strava API application](https://www.strava.com/settings/api). Set its
   authorization callback domain to the Pages hostname you will use. The callback is
   the app's root URL.
2. Deploy the relay with
   `npx wrangler deploy --config cloudflare/strava-events/wrangler.jsonc`.
   In the Pages project, bind its `StravaEvents` Durable Object as `STRAVA_EVENTS`.
   It uses WebSockets to notify open sessions of revocations and activity deletions.
3. Set `STRAVA_CLIENT_ID` and `STRAVA_ORIGIN` in the Pages environment. The origin
   includes the protocol and hostname and has no trailing slash. Add
   `STRAVA_CLIENT_SECRET` and a long random URL-safe `STRAVA_WEBHOOK_TOKEN` as Pages
   secrets, then redeploy Pages.
4. [Register the webhook subscription](https://developers.strava.com/docs/webhooks/)
   with the verification token and the callback at
   `<STRAVA_ORIGIN>/api/strava/webhook/<STRAVA_WEBHOOK_TOKEN>`. Confirm that revoking
   access from Strava ends an open Wornways session. Use your own athlete account
   for the first live test and include the on-device MP4 export and share flow when
   submitting the integration for wider access.

For local testing, put `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, and
`STRAVA_WEBHOOK_TOKEN` in `.dev.vars` in the repo root. Run `npm run dev:web` to build
the app and start both the Pages preview and the Strava relay. The command sets the
local origin to `http://127.0.0.1:8788`. Strava needs a public HTTPS webhook URL to
deliver real events.

The Pages Functions exchange the OAuth code and fetch activity lists and GPS streams
from Strava. An encrypted, HttpOnly cookie keeps the sign-in for up to two hours.
The Functions decrypt it when they need the Strava access token. The browser temporarily
caches encrypted activity summaries and downloaded tracks for the same session.
On reload, Wornways refreshes the list and reuses tracks whose activity details still match.
Ending the session clears the cache. Expired entries are removed on the next
visit if the browser was closed. The current tab can also restore its filters,
selection, and video settings. Previews and the in-app MP4 stay in memory. The
Pages Function and event relay use no server-side activity or session storage.
