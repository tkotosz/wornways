# Web app

Status: **agreed**; details are settled stage by stage. Stages 0 to 3 are built.

The web app turns activity files into replay videos in the browser. Everything runs on
the user's device: files are read, drawn and encoded there, and nothing is uploaded. It is
a static site that can be installed to the home screen.

## What a person does

1. **Adds activities:** drops FIT, GPX or TCX files (also `.gz`), a folder, or an export
   ZIP as downloaded. The app remembers them on the device for the next visit.
2. **Chooses what the video shows:** a period, sports, optionally only activities from
   home, or one single activity.
3. **Adjusts the video** with the settings of [render-settings.md](render-settings.md),
   watching a live preview.
4. **Makes the video**, then shares it to another app or downloads the MP4.

## Screens

The app is a short series of steps, one per screen, with a step bar on top. A person can
always go back to an earlier step; nothing is lost by moving between steps.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ wornways                                 Your files stay on this device │
├──────────────────────────────────────────────────────────────────────────┤
│   (✓ Import) (✓ Activities) (3 Playback) (4 Appearance) (5 Export)       │
├──────────────────────────────────────────────────────────────────────────┤
│ How should your routes play?                                             │
│                                                                          │
│ PLAYBACK STYLE                                                           │
│ ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐     │
│ │ ═══            ✓   │ │ ≡                  │ │ ≡                  │     │
│ │ Recap              │ │ All at once        │ │ Multiday trip      │     │
│ └────────────────────┘ └────────────────────┘ └────────────────────┘     │
│ Video length  ──────────────●───────────────────────────  30 seconds     │
│ ▶ YOUR REPLAY  30 seconds · Recap                                        │
│   This video: 12 months (312 activities), 2.3 s each.                    │
│ Fine-tune playback   Optional: grouping, pace and camera            ⌄    │
│ [← Back]                                                  [Continue →]   │
└──────────────────────────────────────────────────────────────────────────┘
```

The step bar shows a pill per step, numbered, with a tick on the steps behind the current
one, which is outlined in orange. On a phone it shows "Step 3 of 5", the step's name and a
bar with a segment per step; each segment opens its step. Each step is one column on a
phone.

1. **Import.** A drop zone and file and folder pickers, a report of what the last import
   added and what could not be read (closable), and the library as a grid with a header
   row (date, name, sport, distance) and a delete button per row. "Delete all my data"
   removes everything the app stored, after a confirmation. A person who already has
   activities starts at step 2.
2. **Activities.** The filters (the "Which activities" settings): period with shortcuts
   and a calendar for custom days, sports (offered only when the period has them, with
   "All"), and two place filters, "Starts near a place" and "Ends near a place". Each
   opens its own panel, where the place is set in one field: a place clicked on the map
   shown under it (MapLibre with OpenFreeMap's dark style, with zoom buttons, the circle
   of how near counts, and the places activities start, or end, at most often), typed or
   pasted coordinates, or the browser's current location, which is tried first when the
   browser allows it; a slider sets how near counts. The second filter turned on starts
   at the first one's place, so the same place for both takes one pick. A filter without
   a place waits for one. The location never leaves the device. Under the filters, the
   matching activities in the same grid, all ticked at first, with their count and total
   distance; the ticked ones are what the video shows, and unticked ones stay unticked
   when the filters change. Nothing can be deleted here.
3. **Playback.** How the routes play, as a preset: All at once (picked at first), Recap or
   Multiday trip for several activities; Highlight (a 15-second clip of the activity)
   for a single one. Each remembers its own choice. Each preset is a card with a small
   looping drawing of how activities move in it. Under the cards, the video's length,
   then a summary of the replay ("30 seconds · Recap" and a line telling what it plays,
   e.g. "12 months (312 activities), 2.3 s each" or "a race of all 24 activities, each
   at its real pace"), then **Fine-tune playback**, folded at first: grouping, time
   share, group pace, overlap, drawing pace and the camera, built from the settings
   table, starting from the preset's values. Changing the length or one of the preset's
   values makes it Custom ("Custom playback"), and no card is picked; picking a card
   goes back to that preset.
4. **Appearance.** A live preview of the video's last frame, the finished picture, small,
   with the frame's shape, size, frame rate and length, redrawn shortly after each
   change; the motion is seen once the video is made. Beside it on wide screens, under
   it on phones: the frame (aspect ratio: Story, Square or Landscape, for where the
   video will be posted; frame rate: 24, 30 or 60 fps), the title (on or off, starting
   as the automatic one; switched off, a title written stays for switching it on
   again), its position and size, the metrics (on or off, which ones in the order
   picked, their position and size), the street map, and the branding: the end card
   after the replay and the small watermark by the map credit (each on or off). A
   position is the top, middle or bottom row, left, middle or right; text in the middle
   gets a soft dark band behind it. The settings of steps 3 and 4 are remembered for
   the next visit.
5. **Export.** A stage in the video's shape, which shows the finished picture with a "Make
   video" button in the middle; while the video is made, its progress and a way to
   cancel; then the video itself, playing. Download then appears in the bottom bar where
   Continue is on the other steps, and beside it Share, which hands the video to another
   app through the system's share sheet. Share shows only where the browser can share
   files (mostly on phones) and is then the main button.

While no activities are stored (on a first visit, or after deleting everything), step 1
also says in a few words what the app does, and shows how to get the files out of Strava
and Garmin: the whole account at once, or one activity. Afterwards those instructions fold
away to a "How to get your files" line. Sample activities to try the app with come later,
once there are routes that may be published.

## How it works

```
 page (Vue)                         worker                                 device
 ───────────                        ──────                                 ──────
 steps, settings   ── messages ──▶  import, library, preview, video  ──▶  IndexedDB (activities)
 preview canvas    ◀── frames ───   engine + browser adapters        ──▶  Cache Storage (map tiles)
 video player      ◀── MP4 ──────                                    ◀──  map tile server
```

- **Page.** Vue components and nothing heavy. It sends what the user entered (the
  settings as text, the picked files) and shows what comes back. Settings live in
  `localStorage`.
- **Worker.** One Web Worker does all the work, so the page never freezes: reading and
  unpacking files, the activity library, the preview and the final video. The page talks
  to it through a small set of typed messages listed in one file; long tasks report
  progress and can be canceled.
- **Engine.** The same engine as the command-line tool. Two things the command-line tool
  does itself today move into the engine so that both front ends share them: choosing and
  cleaning the activities for the settings, and making a replay (pacing, camera, map
  tiles, frames) through small interfaces for the canvas, the tile cache and the video
  file.
- **Browser adapters** (in `apps/web`): canvases are `OffscreenCanvas`; map tiles are
  fetched from the tile server and kept in Cache Storage; the video is encoded to H.264
  MP4 with the browser's own encoder (WebCodecs) through the Mediabunny library, at a set
  bitrate; activities are kept in IndexedDB.

### Import

- A ZIP is never read whole. Its table of contents is read first, then only the activity
  files and the activity list (`activities.csv`, for names and sports); photos and other
  files are skipped. Archives over 4 GB (ZIP64) work. Unpacking uses the browser's
  built-in `DecompressionStream`.
- A file that cannot be read is skipped and reported; it never stops the import.
- Importing the same activity again does not add it twice, also from another file of it
  (a ride as a FIT and as a GPX file, say): activities starting within a minute and
  200 m of each other are taken for one.
- An activity's name comes from the export's activity list, else from the file itself
  (GPX files carry one), else from the file name.
- The library keeps a short summary of every activity (name, sport, date, distance,
  where it starts and ends) apart from its points, so the list and the filters are
  instant and only the selected activities' points are loaded.

### Preview

- The worker sets up the replay at preview size (the longer side 480 pixels), skips to the
  last frame without drawing the frames before it (their routes still build up the
  heatmap), draws that frame and hands it to the page as an image.
- A change of settings draws a new preview after a short pause, and cancels a preview
  still being drawn. Measured on a desktop: about 0.3 s for one activity, 0.5–1.1 s for a
  month or a year, 4.5 s for about 770 activities at once; the earlier picture stays
  until the new one is ready.
- A playable preview (play, and a bar to move to any moment) is not built; the motion is
  seen in the finished video.

### Video

- Drawn at full size in the worker, each frame handed to the encoder, the finished MP4
  returned to the page as one buffer.
- Text is drawn with a font shipped with the app (Inter, under the SIL Open Font License)
  and loaded in the worker, so a video looks the same on every device.
- Every frame with a map carries the map credit the tile provider asks for.
- Unless switched off, the video ends with the Wornways card, 3.2 s added after the
  replay: the finished map fades to black and the mark draws itself, then the name
  fades in. While the replay plays, a small mark and name sit by the map credit.

### Install

- A web app manifest names the app, its colors and its icons: the mark on a rounded tile,
  and a full-bleed version for systems that crop icons to their own shape. The PNG icons
  are drawn from the SVG marks by `npm run icons`.
- A service worker keeps every file of the app, so an installed app starts without a
  network. The build writes it with the list of the app's files and a version that
  changes when any of them does; a new version is stored in a cache of its own and takes
  over once no window uses the old one. Pages come from the network first, so a reload
  shows a new version at once; the other files come from the cache. Requests to other
  sites (map tiles) are left alone, and the map tiles the app keeps let it make videos of
  areas it has drawn before without a network.
- Chrome and Edge offer to install the app with an event; the app keeps the offer and
  shows an "Install app" button in its header. Safari and Firefox install from their own
  menus.

## Rules

- **Nothing leaves the device** except requests for map tiles, which tell the tile server
  which area is drawn but never the routes. The app says so in plain words.
- **Map tiles** come from OpenFreeMap's public server: free, commercial use allowed, no
  request limit; an app downloading an area uses at most 4 requests at a time, and video
  must credit "OpenFreeMap © OpenMapTiles Data from OpenStreetMap"
  (https://openfreemap.org, checked 2026-11-16). When the map cannot be loaded the video
  is made without it and the app says why.
- **Browsers.** The app checks at the start that the browser can draw off the main thread
  and encode H.264, and explains what to use if it cannot. From MDN's compatibility data
  (https://github.com/mdn/browser-compat-data, checked 2026-11-16): video encoding
  (WebCodecs) needs Chrome or Edge 94, Safari 16.4 (also on iPhone) or desktop Firefox
  130, and is missing in Firefox for Android; sharing a file works in Chrome for Android
  and in Safari (also on iPhone), not in Firefox; a page can show its own install button
  in Chrome and Edge, not in Firefox or Safari, which install from their own menus.
- **Personal data never enters the repository.** Tests use generated activity files.

## Measured

Drawing, with the engine in Node on a 12-thread desktop (2026-11-16):

| Selection                                | Preview setup (540×960) | Preview frame | Full-size frame (1080×1920) | Canvas memory at full size |
| ---------------------------------------- | ----------------------- | ------------- | --------------------------- | -------------------------- |
| One activity                             | 0.1 s                   | 3.6 ms        | 14.6 ms                     | 169 MB                     |
| A month of about 25 activities           | 1.1 s                   | 2.3 ms        | 8.6 ms                      | 291 MB                     |
| A year of about 300 activities           | 0.3 s                   | 2.2 ms        | 5.9 ms                      | 33 MB                      |
| About 600 activities, 1.4 million points | 1.9 s                   | 3.3 ms        | 8.7 ms                      | 99 MB                      |

A frame has 33 ms at 30 frames per second, so the preview plays in real time with room
to spare, and a rebuild after a change takes between a tenth of a second and two seconds.
Reading and cleaning about 650 files took 1.5 s. A library of that size holds about 2.6
million points, around 80 MB in browser storage.

Making whole videos in the browser, drawing and encoding in a worker (2026-11-15): Full HD
videos of 19 to 39 s took 14 to 35 s in Chrome on the same desktop, which encodes
in software, and 6 to 24 s in Chrome on a recent Android phone, which encodes in
hardware. Every video was made faster than it plays.

Importing a whole account export in the browser (headless Chromium on the same desktop,
2026-11-16): a 3.4 GB export ZIP with 769 activities took 3.9 s, as only the activity
files and the activity list are read from it. The library then took 53 MB of browser
storage and loaded again in 1 s on the next visit.

## Build stages

Each stage ends with the build, the tests and the lint passing, and is checked in a real
browser by an automated test that imports generated activity files and makes a video.

0. **Share the use cases.** Move "choose and clean the activities" and "make a replay"
   from the command-line tool into the engine, behind interfaces for the canvas, the tile
   cache and the video file. The command-line tool keeps producing identical videos. Then
   follow the tile provider's terms: 4 requests at a time and its credit wording.
1. **Files to video.** The app with its worker, browser adapters and font, and the first
   and the last step: drop activity files, make a video with the default settings, watch
   and download it.
2. **Library.** Export ZIPs and folders, names and sports from the activity list,
   activities kept on the device, the Choose step with its filters, deleting in the grid.
3. **Settings.** The Video and Text steps built from the settings table, with remembered
   settings and a preview of the video's last frame on the Text step.
4. **Share and install.** Sharing, the installable app (manifest, icons, offline start),
   the first-visit explanation (sample activities later), messages for browsers that cannot
   make videos, and a pass over the phone layout on a real phone.
5. **Publish.** Hosting as a static site, at the very end; Cloudflare Pages is the
   candidate and its terms are checked again then. The published app lists the licenses
   of what it ships: the libraries (Mediabunny is under the Mozilla Public License 2.0),
   the font and the map data.

## Not in the first version

Accounts or syncing between devices; connections to Strava, Garmin or other services; a
tilted or 3D camera; satellite maps; custom image overlays; imperial units; languages
other than English.

## Open questions

- **Memory on phones.** At full size the zoom camera needs up to about 300 MB of
  canvases. A recent Android phone handled that; an iPhone may refuse. The fallbacks are
  the fixed camera, a smaller frame, or smaller zoom levels.
- **Safari.** No Apple device is available for testing, so the first version is built for
  and tested in Chrome on a desktop and on Android. Safari has the features the app needs
  on paper; until someone has run it there, the app must not claim that it works.
- **Stored data can be removed by the browser.** Safari deletes a site's stored data
  after 7 days without the person using the site, except for an app added to the home
  screen (https://webkit.org/tracking-prevention/, checked 2026-11-16). The app asks the
  browser to keep its data and must work with an empty library at any time.
