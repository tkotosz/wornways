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
│        (✓ Source) (✓ Activities) (3 Design) (4 Export)                   │
├──────────────────────────────────────────────────────────────────────────┤
│ (Frame) [Playback] (Map) (Overlay) (Ending)                              │
│ ┌─────────────┐  PLAYBACK STYLE                                          │
│ │             │  ┌────────────────┐ ┌────────────────┐ ┌──────────────┐  │
│ │   preview   │  │ ═══        ✓   │ │ ≡              │ │ ≡            │  │
│ │      ▶      │  │ Recap          │ │ All at once    │ │ Multiday trip│  │
│ │             │  └────────────────┘ └────────────────┘ └──────────────┘  │
│ │             │  Video length ─────────●──────────────────  30 seconds   │
│ └─────────────┘  ▶ YOUR REPLAY  30 seconds · Recap                       │
│                  Fine-tune playback   Optional: grouping, pace and camera│
│ [← Activities]                                               [Export →]  │
└──────────────────────────────────────────────────────────────────────────┘
```

The step bar shows a pill per step, numbered, with a tick on the steps behind the current
one, which is outlined in orange; a pill opens its step. Moving between steps works the
same way on every step: a way back and a way on, which always change the step. On wide
screens they sit in a bar at the bottom of the step and name the step they go to ("←
Source", "Design →"); the bar stays at the bottom of the window while the step is taller,
with the step's own actions between them (Download and Share on Export). On a phone a slim
bar at the top of the window takes the place of the header and the pills: ← at the left,
the step's name, and Next at the right, with a segment per step under them that shows how
far along it is (the ones behind filled, the current one bright); the buttons tell screen
readers which step they go to. The bottom bar then holds only the step's own actions, when
there are some. Each step is one column on a phone.

The list of sources, before one is chosen, is the app's home screen: the header with the
name, the version and About (and Install app where offered), and no step bar or pills,
since there is nowhere to go back to and nothing to go on with until a source is picked.
On a phone it is the only screen with the header; wide screens keep the header on every
step. A chosen source's screen is step 1, and its way back ("← Sources") leads to the
list.

1. **Source.** Where the activities come from: files on this device, Strava, Ride with
   GPS (the last two where the site offers them) or the demo. One source is chosen at a
   time, and activities of different sources are never mixed. Until one is chosen the
   step lists them as cards like the playback presets, in the order Demo, Files, Ride
   with GPS, Strava, each with an icon and where it stands ("25 made-up activities", "3
   activities on this device", "Connected · 12 downloaded", "Not connected"). Until a
   source is picked, the way on and the later steps are disabled. Ride with GPS's card
   shows its official icon; Strava's brand rules allow only its connect button and
   badges, so its card has a drawing. Picking one shows what it needs, under a "Current
   source" heading with the source's name. Its way back ("← Sources") clears the choice
   and lists the sources again (connections stay): for files, a
   drop zone and file and folder pickers, a report of what the last import added and what
   could not be read (closable), and the library as a grid with a header row (date, name,
   sport, distance) and a delete button per row ("Delete saved activities" removes them
   all, after a confirmation); for Strava and Ride with GPS, connecting, or the
   connection with a Disconnect button and the activities whose tracks are downloaded to
   this device, in the same grid, each deletable ("Delete downloaded tracks" removes them
   all; a deleted track is downloaded again when a video needs it) (a connection stays
   when another source is chosen: Strava's for its two hours, Ride with GPS's until it is
   disconnected); for the demo, what it holds and its activities in the grid, without
   delete buttons; picking the demo loads them. The choice is remembered for the next
   visit (without one, the list shows); a person whose chosen source is ready (files on
   the device, a service connected) starts at step 2.
2. **Activities.** Which activities the video shows is always a choice made, not a default:
   with files or the demo the step starts with no period picked ("Which activities? Pick a
   period."), and the other filters, the list and the way on come once one is (Strava and
   Ride with GPS, which list a period at a time, start on this month). The filters (the
   "Which activities" settings): period with shortcuts and a calendar for custom days,
   sports (offered only when the period has them, with "All"), and two place filters,
   "Starts near a place" and "Ends near a place". Each opens its own panel, where the place
   is set in one field: a place clicked on the map shown under it (MapLibre with
   OpenFreeMap's dark style, with zoom buttons, the circle of how near counts, and the
   places activities start, or end, at most often), typed or pasted coordinates, or the
   browser's current location, which is tried first when the browser allows it; a slider
   sets how near counts. The second filter turned on starts at the first one's place, so the
   same place for both takes one pick. A filter without a place waits for one. The location
   never leaves the device. Under the filters, the matching activities in the same grid, all
   ticked at first, with their count and total distance; the ticked ones are what the video
   shows, and unticked ones stay unticked when the filters change. Nothing can be deleted
   here.
3. **Design.** Each time the step comes after Activities, it first asks how the video plays:
   "How should it play?" with the presets these activities can take as cards (the drawing,
   the name and its line), none picked, and "Keep my own playback" when the playback was set
   by hand. The style decides what the video is, so it is always chosen; the editor and the
   way on to Export wait for it, and Playback › Style changes it later. Coming back from
   Export does not ask. Then: how the video plays and looks, in sections, with a section bar
   under the step bar, in the order things are decided; the bar shows where the person is,
   so the step has no title of its own. The bar opens any section, in any order, since every
   setting has a default; the buttons to Activities and Export leave the step from any
   section. The section open last is kept while the app is open, also when coming back from
   Export. One live preview stays while the sections change (see Preview). On wide screens
   it sits beside the settings and the page scrolls. On phones the step is a full editor
   screen that does not scroll, laid out like photo and video editors: the slim step bar on
   top, in place of the app's header; the preview alone, with no lines around it, as large
   as the room allows; under it the open section's settings in a panel of fixed height, so
   the picture does not jump, as a list: a row per setting with its value at the right
   ("Grouping · Day ›"), under a heading per group where the section has several. A switch
   turns in place, and a group switched off keeps only its switch. Any other row opens its
   setting alone in a sheet from the bottom, with the top of the picture still in view and
   changes drawn on it as they are made: a choice as an option per row, with its
   explanation; a number as a slider with the exact value; a position as the nine squares
   with its name; the values to show as chips picked in order; the presets as their cards.
   Done, Escape or a tap above the sheet closes it. The five sections along the bottom, with
   a drawing each. The settings of this step are remembered for the next visit.
   - **Frame:** the aspect ratio (Story, Square or Landscape, for where the video will be
     posted, or a custom size) and the frame rate (24, 30 or 60 fps). It comes first
     because the shape decides how everything else looks.
   - **Playback:** how the routes play, as a preset: All at once (picked at first), Recap
     or Multiday trip for several activities; Highlight (a 15-second clip of the
     activity) for a single one. Each remembers its own choice. Each preset is a card with
     a small looping drawing of how activities move in it. Under the cards, the video's
     length, then a summary of the replay ("30 seconds · Recap" and a line telling what it
     plays, e.g. "12 months (312 activities), 2.3 s each" or "a race of all 24
     activities, each at its real pace"), then **Fine-tune playback**, folded at first:
     grouping, time share, group pace, overlap, drawing pace and the camera, built from
     the settings table, starting from the preset's values. Changing the length or one of
     the preset's values makes it Custom ("Custom playback"), and no card is picked;
     picking a card goes back to that preset.
   - **Map:** the street map, and the replay privacy that hides each route's start and
     finish.
   - **Overlay:** what is drawn over the replay, as widgets arranged on the still the way
     stickers are in a story editor: text (at first the title), one value each (a metric:
     its number large with a few words under it, "1,147 km" over "distance"), and the
     elevation chart (when an activity recorded elevation). A video starts with the widgets
     the title, metrics and elevation profile settings describe: the title at the top, the
     first value large at the bottom left with the others smaller in a row under it, and,
     for a single activity, the chart along the bottom. Each widget is centered on its point
     of the frame, so it keeps its place while its value changes during the replay; text has
     a soft shadow around its letters, so it reads on a busy map without darkening the
     frame. On the still each widget has an outline over where the engine drew it (the boxes
     it reports with the still). A tap picks one: its name on a tab, × to remove it and a
     corner handle; Play steps aside while one is picked, and a tap on the picture outside
     the widgets lets it go. Dragging moves it, a copy of it cut from the still following
     the finger until the picture drawn for it arrives; it snaps to the frame's center
     lines, with a line shown, and while it is dragged a bin shows at the bottom, where
     letting it go removes it. Two fingers, or the corner handle, resize it (50 to 250%). A
     tap on a picked text widget opens its text. The still is drawn again as soon as a
     widget is let go, without the usual pause. The arrow keys move a picked widget by 1% of
     the frame (5% with Shift), + and - resize it and Delete removes it. On a story-shaped
     frame, while a widget is picked or moved, hatched guides show what Instagram's own
     controls cover (Meta's ads guide: 14% at the top, 35% at the bottom, 6% at each side).
     Under the picture, "+ Add a widget" opens the palette: Text, the elevation chart, and
     each value this video can show as a tile with its own number (calories a service gives
     on request are offered before they are known); a value already on the picture is
     dimmed, and a new widget comes in a free spot clear of the middle, where Play sits.
     Then a row per widget with what it shows, which opens its settings: its text (or back
     to the title), its size and "Remove from the picture". The small watermark at the
     bottom left, on the map credit's line, stays a switch.
   - **Ending:** what comes after the replay: the end pause on the finished picture, the
     totals card (for several activities only; on for Recap) and the end card.
4. **Export.** A stage in the video's shape, which shows the finished picture with a "Make
   video" button in the middle; while the video is made, its progress and a way to
   cancel; then the video itself, playing. Download then appears in the bottom bar, and
   beside it Share, which hands the video to another
   app through the system's share sheet. Share shows only where the browser can share
   files (mostly on phones) and is then the main button.

Until a source is chosen (on a first visit), step 1 also says in a few words what the app
does. On the files screen, "How to get your files" starts collapsed and opens instructions
for exporting an account or a single activity from Strava or Garmin.

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
- A ZIP inside a ZIP (a Garmin export keeps its activity files in two) is read into
  memory whole and then read the same way; about 100 MB for a Garmin export.
- In a Garmin export, activity files sit among thousands of the watch's other FIT files
  (daily monitoring, sleep, settings); the `file_id` type at the start of each file tells
  them apart. Names and sports come from `DI-Connect-Fitness/*_summarizedActivities.json`,
  which does not say which file an activity is in, so a file belongs to the listed
  activity whose time span holds its first position. Garmin activities get the id
  `garmin-<activity id>`, and Garmin's activity types are mapped to the same sport names
  as Strava's.
- A file that cannot be read is skipped and reported; it never stops the import.
- Importing the same activity again does not add it twice, also from another file of it
  (a ride as a FIT and as a GPX file, say): activities starting within a minute and
  200 m of each other are taken for one.
- An activity's name comes from the export's activity list, else from the file itself
  (GPX files carry one), else from the part of the day it started in and its sport, such
  as "Morning ride". Export file names ("10004710540.fit") say nothing, so they are not
  used.
- The library keeps a short summary of every activity (name, sport, date, distance,
  where it starts and ends) apart from its points, so the list and the filters are
  instant and only the selected activities' points are loaded.

### Ride with GPS

- Ride with GPS is a source like Strava: while it is the source, the Activities step lists
  the account's trips, and tracks are downloaded only when needed. The newest few are
  fetched ahead, a trip ticked again moves to the front, and leaving the Activities step
  fetches the chosen trips' missing tracks, a few at a time. This code is shared with
  Strava (`worker/remote-activities.ts`); each service says how to list and how to fetch
  one track.
- For both services, a download that takes more than half a second opens a dialog with
  the count, a percentage bar and Cancel (Escape cancels too). Canceling stops at once
  and stays on the Activities step; downloads already under way finish and are kept, so
  going on again fetches only the rest. Loading a list shows a moving bar in place of the
  buttons of the source being opened, or above the activities.
- Connecting: the page links to `/api/ridewithgps/connect`, a Pages Function that sends
  the person to Ride with GPS's authorization page with a random state, also kept in a
  short-lived cookie. Ride with GPS sends them back to `/api/ridewithgps/callback`, which
  checks the state, trades the code for a token (this needs the client secret), seals
  the token in an encrypted HttpOnly cookie for `/api/ridewithgps`, and sends the person
  on to `/?ridewithgps=<outcome>`. The code and the token never reach page scripts.
- Ride with GPS tokens do not expire and allow changing the account. The cookie lasts
  30 days, and the Functions only read: the trip list and one trip at a time.
- The trip list has no date filter, so it is read whole when Continue leaves the Source
  step (or a reload opens Ride with GPS), 200 trips a page, while the Activities step shows
  it loading; the Function returns only the fields the app uses. The filters then work on
  it in the worker, and "All time" is offered. Trips without a route (indoor ones) are
  left out.
- The Source step asks nothing of Strava or Ride with GPS: whether a service is connected
  comes from this site's own Functions (the sign-in cookie), and what it keeps from the
  stored copies (Ride with GPS stores each trip's name, date, sport and distance with its
  track; Strava keeps an encrypted index beside its cache). A Strava list stops at the
  first page that is not full.
- One trip comes through the Function as Ride with GPS sends it, unparsed (megabytes for
  a long ride). The worker keeps longitude, latitude, elevation and time.
- Downloaded tracks are kept in the browser's Cache Storage until disconnect, keyed by
  trip and stored with when the trip last changed (`updated_at`): an edited trip is
  fetched again, and the tracks of trips no longer in the list are removed when it is
  read. Ride with GPS's terms allow keeping what the person chooses to use, so there is no
  time limit as for Strava. Disconnecting revokes the token, ends the cookie and deletes
  these tracks.
- A reload opens Ride with GPS again when it is the chosen source, with the tab's filters
  and selection; choosing files, Strava or the demo keeps the connection. When the person
  comes back from connecting one service, that one is the chosen source; the other one's
  connection stays. The look of the video (the Design step) is the same one files use.
- Trips get the id `rwgps-<trip id>`, and Ride with GPS's activity types (`cycling:road`,
  `running:trail`, ...) are mapped to the same sport names as files. There is no webhook:
  changes on Ride with GPS show up the next time the list is read.

### Demo

- Besides files, Strava and Ride with GPS, the Source step offers a demo: made-up rides and
  runs on real roads in Mallorca, for trying Wornways before adding one's own activities.
  A month of rides and runs from one town (for a recap), a five-day tour of the island
  (for a multiday trip) and one long climb (for a highlight). It is a source like the
  others, so it never mixes with one's own activities; it is always offered.
- The activities ship with the app as `apps/web/public/demo/mallorca.zip`, shaped like a
  Strava export, and the importer reads them like any export. They are fetched only when
  the demo is picked; the service worker does not store files under `demo/` in advance.
- While the demo is open, the worker holds its activities in a library of their own, in
  memory. They never go into the person's library, and the demo's choice and adjustments
  start fresh each time and are not saved. Leaving the demo or reloading the page lets
  them go.
- The file is built by `npm run demo-routes` (`apps/cli/src/demo`): a road network from the
  road lines of zoom-13 map tiles, shortest paths between named places (quieter roads
  preferred; paths only for runs), heights, and recorded times at a sport's speed with a
  little variation. The heights come from Terrain Tiles (open data on AWS; for Mallorca,
  SRTM on land and ETOPO1 at sea, about 30 m per pixel at zoom 12): read every 20 m along
  a route and averaged over 200 m of it, since 30 m pixels next to a winding mountain road
  also catch the slope beside it. The speed follows the gradient: a ride at about half its
  speed up a 7% climb and at most 1.8 times it downhill; a run at about 60% up a 10% climb
  and at most 1.15 times downhill. The same map and terrain data always give the same
  file. The map download stays within OpenFreeMap's terms for offline use: under 3,000
  tiles, 4 requests at a time, a User-Agent naming the app; the terrain tiles the routes
  need (about 50) are fetched 4 at a time and kept beside the map tiles.
- The routes are drawn from OpenStreetMap data, so the ZIP is published under the Open
  Database License with "© OpenStreetMap contributors" (in the ZIP's `README.txt` and in
  `THIRD_PARTY_NOTICES.md`).

### Preview

- The worker sets up the replay at preview size (the longer side 480 pixels), skips to the
  last frame without drawing the frames before it (their routes still build up the
  heatmap), draws that frame and hands it to the page as an image.
- A change of settings draws a new preview after a short pause, and cancels a preview
  still being drawn. Measured on a desktop: about 0.3 s for one activity, 0.5–1.1 s for a
  month or a year, 4.5 s for about 770 activities at once; the earlier picture stays
  until the new one is ready.
- The still is the replay's last frame, except in the Ending section: there it is how the
  video ends, the totals card with every value counted up when the video has one, else
  the end card once drawn, else the last frame.
- Play, in the middle of the picture, makes a draft of the whole video, end card
  included, and plays it in its place, with the player's bar to move to any moment. The
  draft is the real video made small: at the preview's size, 15 frames a second and a
  low bitrate, by the same code as Export. While it is made, the picture shows how far it
  is, with Cancel. Any change of settings goes back to the picture until Play is pressed
  again; the draft stays while the settings stay the same, also from one section or step
  to the other.
- In the Overlay and Ending sections, where things are arranged on the picture, the
  preview opens on the still. Play shows the draft (made then, or the one already made for
  these settings) and its corner button Edit goes back to the still. Nothing is drawn or
  played in the background: a draft is made only when Play is pressed. The engine draws frames forward only, so a video is what lets a person move back
  and forth. Measured in headless Chromium without a GPU: under 3 s for the 25 demo
  activities at once.

### Video

- Drawn at full size in the worker, each frame handed to the encoder, the finished MP4
  returned to the page as one buffer.
- Text is drawn with a font shipped with the app (Inter, under the SIL Open Font License)
  and loaded in the worker, so a video looks the same on every device.
- Every frame with a map carries the map credit the tile provider asks for.
- When the totals card is on, 3.4 s of totals follow the replay: the map dims and the
  activities, kilometers, hours moving and meters climbed count up under the title.
- Unless switched off, the video ends with the Wornways card, 3.2 s added after the
  replay: the finished map fades to black and the mark draws itself, then the name
  fades in. While the replay plays, a small mark and name sit at the bottom left, on the
  map credit's line.

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
  shows an "Install app" button in its header. Safari on iPhone and iPad sends no such
  event, so there the button explains its Share → Add to Home Screen steps instead.
  Firefox installs from its own menu, and the button stays hidden.

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
  and in Safari (also on iPhone), not in Firefox; a page can start installing itself
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

Accounts or syncing between devices; connections to services other than Strava and Ride
with GPS, such as Garmin (see [skipped-features/garmin-connect.md](skipped-features/garmin-connect.md)
for why); a tilted or 3D camera; satellite maps; custom image overlays; imperial units;
languages other than English.

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
