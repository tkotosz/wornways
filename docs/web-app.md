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

The app is one screen, the editor, under a top bar. Everything set up around the video
happens in popups over it: the source, connecting it, what it keeps on the device, the
activities, the preset and the finished video. On the way in each popup leads to the next;
after that the top bar opens any of them, at any time.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ☰  (Activities 25) (Files) (Preset)                             [Render] │
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
└──────────────────────────────────────────────────────────────────────────┘
```

**The top bar.** At the left, icons with a short caption under each, the same whatever is
set (Menu, Activities, Files or Connection, Preset), so the bar keeps its width; each tells
screen readers what it opens and what is set: the menu (☰); the activities, with how many
the video shows as a badge ("Activities: 25"); what the source keeps on the device (files,
or a service's connection; not for the demo); and the preset ("Preset: Recap"). At the
right, Render, the main button. Before activities are chosen, the activities and preset
icons and Render are disabled.

**The menu** slides in from the left over the dimmed screen: the mark, the name and the
version, then Switch source (with the source in use),
Install app (where offered, see Install), About (what the app is, its license, the source
on GitHub and the licenses) and the privacy policy, a page of its own. Back, Escape, a tap
beside it or picking an item closes it.

**Popups** take the whole screen on a phone and are a panel in the middle on a wide screen,
over the dimmed editor. Each has a title, its content, which scrolls, and a footer for its
buttons, which share the footer's width on a phone. Once there is something to edit, a
popup closes with ✕, Escape, a tap beside the panel or the back gesture, and the editor is
as it was. Until then the popups on the way in cannot close, since there is nothing behind
them, and have the menu's button in place of ✕. Each popup and the menu are an entry in
the browser's history, so the phone's back gesture closes them instead of leaving the site.

**The way in.** A first visit starts with the sources. Picking one leads on: Strava and Ride
with GPS ask to connect when they are not connected; files ask for files while there are
none; then the activities are chosen, and their button takes them to the editor. The
preset is asked when the editor is set up for a new kind of selection: the source's first
one, or a change between one activity and several, and only where there is more than one
preset to pick (a single activity has one, Highlight, which it gets without asking). The
kind is remembered for each source for the next visit (the demo starts fresh). Choosing
more or fewer activities of the same kind goes straight back to editing. A forced preset
popup closes only with a choice. The source is remembered for the next visit: files with
the choice made last time go straight to editing it; another source that is ready (files
on the device, a service still connected, the demo) opens on its activities; one whose
connection ended asks to connect again.

1. **Sources.** Where the activities come from: files on this device, Strava, Ride with
   GPS (the last two where the site offers them) or the demo. One source is used at a
   time, and activities of different sources are never mixed. They are cards like the
   playback presets, in the order Demo, Files, Ride with GPS, Strava, each with an icon and
   where it stands ("25 made-up activities", "3 activities on this device", "Connected · 12
   downloaded", "Not connected"); the one in use is marked. Ride with GPS's card shows its
   official icon; Strava's brand rules allow only its connect button and badges, so its
   card has a drawing. On a first visit a few words above them say what the app does.
   Picking the source in use goes straight to its activities; another one starts over from
   it, and a connection stays when another source is picked: Strava's for its two hours,
   Ride with GPS's until it is disconnected. Picking the demo loads its activities.
2. **Connect.** Strava or Ride with GPS, when picked and not connected: what the connection
   allows and the service's own Connect button, which leaves for its sign-in page and comes
   back to the activities, with the privacy policy linked; Switch source picks another one.
3. **Stored on this device.** For files: a drop zone and file and folder pickers, a report of
   what the last import added and what could not be read (closable), "How to get your
   files" (instructions for exporting an account or a single activity from Strava or
   Garmin), and the library as a grid with a header row (date, name, sport, distance) and a
   delete button per row ("Delete saved activities" removes them all, after a
   confirmation). For Strava and Ride with GPS: the connection with a Disconnect button,
   and the activities whose tracks are downloaded to this device, in the same grid, each
   deletable ("Delete downloaded tracks" removes them all; a deleted track is downloaded
   again when a video needs it). Disconnecting the source in use asks to connect again. On
   the way in, and when opened from the activities, "Choose activities" goes on to them.
4. **Activities.** Files and the demo start on all their activities, all ticked; Strava and
   Ride with GPS, which list a period at a time, start on this month (Strava with none
   ticked). The files' choice is remembered for the next visit, the services' for the tab,
   and the demo's starts fresh. Above the filters, the source
   in use, with links to manage what it keeps ("Manage files", "Manage connection") and to
   change it. The filters (the "Which activities" settings): period with shortcuts and a
   calendar for custom days, sports (offered only when the period has them, with "All"),
   and two place filters, "Starts near a place" and "Ends near a place". Each opens its own
   panel, where the place is set in one field: a place clicked on the map shown under it
   (MapLibre with OpenFreeMap's dark style, with zoom buttons, the circle of how near
   counts, and the places activities start, or end, at most often), typed or pasted
   coordinates, or the browser's current location, which is tried first when the browser
   allows it; a slider sets how near counts. The second filter turned on starts at the
   first one's place, so the same place for both takes one pick. A filter without a place
   waits for one. The location never leaves the device. Under the filters, the matching
   activities in the same grid, all ticked at first, with their count and total distance;
   the ticked ones are what the video shows, and unticked ones stay unticked when the
   filters change. Nothing can be deleted here. The footer's button ("Use 12 activities")
   takes them to the editor, once the tracks of a service are downloaded. Closed without
   it, the activities are as they were.
5. **Preset.** "How should it play?": the presets these activities can take as cards (the
   drawing, the name and its line), and "Keep my own playback" when the playback was set by
   hand. Asked for a new kind of selection, none is picked; opened from the top bar, the one
   in use is marked. It is the only place the preset is picked, and picking one starts the
   playback over from it: what was fine-tuned goes. A preset sets the widgets
   too: another preset than the one in use starts them again from the ones that suit its
   video, over the replay and on the totals card, as does a change to a single activity;
   the preset in use picked again, and "Keep my own playback", keep them.
6. **Render.** Render makes the video at once: a stage in the video's shape with its
   progress, and Cancel in the footer; then the video itself, playing, with Download and,
   where the browser can share files (mostly on phones), Share, which hands the video to
   another app through the system's share sheet and is then the main button. Closing it
   goes back to editing and stops a video still being made. The video is kept while the
   settings stay the same, so Render shows it again without making it twice.

**The editor.** How the video plays and looks, in sections, with a section bar in the order
things are decided; the bar shows where the person is, so the screen has no title of its
own. The bar opens any section, in any order, since every setting has a default. The
section open last is kept while the app is open, also while popups open and close. One
live preview stays while the sections change (see Preview). On wide screens it sits beside
the settings and the page scrolls, under the top bar. On phones the editor is a screen that
does not scroll, laid out like photo and video editors: under the top bar the preview
alone, with no lines around it, as large as the room allows; under it the open section's
settings as one strip of chips that scrolls sideways, a chip per setting with its name
small over its value ("Grouping" over "Day"), so the picture keeps most of the screen. A
switch turns in place on its chip, and a group switched off keeps only its switch. Any
other chip opens its setting alone in a sheet from the bottom, with the top of the picture
still in view and changes drawn on it as they are made: a choice as an option per row, with
its explanation; a number as a slider with the exact value; a position as the nine squares
with its name; the values to show as chips picked in order; the presets as their cards.
Done, Escape or a tap above the sheet closes it. The five sections along the bottom, with a
drawing each. The editor's settings are remembered for the next visit.

- **Frame:** the aspect ratio (Story, Square or Landscape, for where the video will be
  posted, or a custom size) and the frame rate (24, 30 or 60 fps). It comes first
  because the shape decides how everything else looks.
- **Playback:** how the routes play, past the preset picked from the top bar (All at
  once, picked at first, Recap or Multiday trip for several activities; Highlight, a
  15-second clip of the activity, for a single one; each remembers its own choice): the
  video's length, then a summary of the replay ("30 seconds · Recap" and a line telling
  what it plays, e.g. "12 months (312 activities), 2.3 s each" or "a race of all 24
  activities, each at its real pace"), then **Fine-tune playback**, folded at first:
  grouping, time share, group pace, overlap, drawing pace and the camera, built from
  the settings table, starting from the preset's values. Changing the length or one of
  the preset's values makes it Custom ("Custom playback", and "Preset: Custom" in the top
  bar); picking a preset again starts the playback over from it.
- **Map:** the street map, and the replay privacy that hides each route's start and
  finish.
- **Overlay:** what is drawn over the replay, as widgets arranged on the still the way
  stickers are in a story editor: text (at first the title), one stat each (a value,
  with its words under it at first; they can also go before, after or above it, or be left
  out, and say words of its own),
  and the
  elevation chart (when an activity recorded elevation). A video starts with the title at
  the top, the values that suit it at the bottom left (the first large, the others
  smaller in a row under it), and, for a single activity, the chart along the bottom. Each widget is centered on its point
  of the frame, so it keeps its place while its value changes during the replay; text has
  a soft shadow around its letters, so it reads on a busy map without darkening the
  frame. In Overlay the still is drawn without the widgets (the engine lays them out and
  leaves them off it) and the page draws them over it, at the sizes, font and shadow the
  engine draws them with in the video, so they move under the finger at once; the still
  is drawn again only for what is under them (and once when calories are first shown,
  which a service may give only on request). Play in the middle plays the draft video,
  with the widgets drawn by the engine, and Edit goes back to the still; Play steps aside
  while a widget is picked. A tap picks one, the widget nearest the finger within about
  28 pixels, so a fingertip need not land on a small widget exactly: its name on a tab
  and a corner handle; a tap on the picture outside the widgets lets it go. Dragging
  moves it; it snaps to the frame's center lines first, else in line with another
  widget's left edge, middle or right edge across and top or bottom down, with a line
  shown; a widget is removed only on purpose (Remove in the strip or its settings, or
  Delete), never by where it is dragged. Two fingers, or the corner handle, resize it (50 to 250%). A tap on a picked text
  widget opens its text over the whole screen, large as on the video, with the keyboard
  up; a tap outside the text or Enter finishes it, and a text left empty is removed. The
  arrow keys move a picked widget by 1% of the frame (5% with
  Shift), + and - resize it and Delete removes it. On a story-shaped frame, while a
  widget moves, hatched guides marked "Covered on Instagram" show what Instagram's own
  controls cover (Meta's ads guide: 14% at the top, 35% at the bottom, 6% at each side).
  Under the picture, as in the other sections, a strip of chips: Add Text writes a new
  text; Add Stat opens a sheet of the stats this video can show, grouped by what they
  measure (time, distance, speed, elevation, heart rate, power, cadence, temperature,
  calories, activities; a group only when the video has one of its values), each a tile with
  its own number (calories a service gives on request are offered before they are known; a
  value already on the picture is dimmed); the elevation chart's switch (offered only
  when an activity recorded elevation); and the watermark's, a fixed small mark at the
  bottom left on the map credit's line. A new widget comes in a free spot clear of the
  middle. A picked widget turns the strip into its own chips: Done (lets it go), Edit
  (a text's text), Size (a sheet with a slider), Label (where a value's words go:
  off, before, after, above or under, each with how the value reads in it; and the words
  themselves, its usual ones until edited, with a way back to them), Unit (for a value
  that has one: shown, or off for the number alone), Format (for a time, a date or a clock time: h:mm:ss, h:mm,
  hours or days; five ways to write a date; 24 or 12 hours; each with how the value reads
  in it) and Remove. After the widgets' tools the strip has
  the units (metric or imperial, for every value of the video and its totals card; also in
  Ending) and the watermark switch. On a wide screen the same strip is under the picture, and a list stays
  beside it: "+ Add a widget" with the same palette, then a row per widget that opens all
  its settings, then the units and the watermark switch.
- **Ending:** what comes after the replay: the end pause on the finished picture, the
  totals card (for several activities only; on for Recap) and the end card. When the
  video has the totals card, the picture is the finished card, drawn without its widgets,
  and the page draws them over it, as in Overlay: at first the usual totals, without the
  title (Add Text puts it back), at the card's sizes (a text over its short orange rule, a total's number over
  its words in orange). They are picked, moved, resized and removed as over the replay,
  and the strip has the same chips between the card's switch and the end card's: Add
  Text and Add Total (a sheet of the totals these activities have, each with its own
  number), and after them the units and the end card's switch; there is no chart or
  watermark on the card. A total is written as over the replay ("1,147 km" over "total
  distance") and has the same Label, Unit and Format chips; its words go under it at first,
  or above it, before or after it (smaller and orange on the number's line), or none. The card's band behind them stays where the still drew it until it is drawn
  again; the video has it behind the widgets as they are.

## How it works

```
 page (Vue)                         worker                                 device
 ───────────                        ──────                                 ──────
 editor, popups    ── messages ──▶  import, library, preview, video  ──▶  IndexedDB (activities)
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

- Ride with GPS is a source like Strava: while it is the source, the activities popup lists
  the account's trips, and tracks are downloaded only when needed. The newest few are
  fetched ahead, a trip ticked again moves to the front, and taking the activities to the
  editor fetches the chosen trips' missing tracks, a few at a time. This code is shared with
  Strava (`worker/remote-activities.ts`); each service says how to list and how to fetch
  one track.
- For both services, a download that takes more than half a second opens a dialog with
  the count, a percentage bar and Cancel (Escape cancels too). Canceling stops at once
  and stays on the activities; downloads already under way finish and are kept, so
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
- The trip list has no date filter, so it is read whole when Ride with GPS is picked (or a
  reload opens it), 200 trips a page, while the activities popup shows it loading; the Function returns only the fields the app uses. The filters then work on
  it in the worker, and "All time" is offered. Trips without a route (indoor ones) are
  left out.
- The list of sources asks nothing of Strava or Ride with GPS: whether a service is connected
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
  connection stays. The look of the video (the editor's settings) is the same one files use.
- Trips get the id `rwgps-<trip id>`, and Ride with GPS's activity types (`cycling:road`,
  `running:trail`, ...) are mapped to the same sport names as files. There is no webhook:
  changes on Ride with GPS show up the next time the list is read.

### Demo

- Besides files, Strava and Ride with GPS, the list of sources offers a demo: made-up rides and
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
  low bitrate, by the same code as Render. While it is made, the picture shows how far it
  is, with Cancel. Any change of settings goes back to the picture until Play is pressed
  again; the draft stays while the settings stay the same, also from one section to the
  other and while popups open and close.
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
  shows "Install app" in its menu. Safari on iPhone and iPad sends no such event, so there
  the item explains its Share → Add to Home Screen steps instead. Firefox installs from its
  own menu, and the item stays hidden.

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
