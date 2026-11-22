# Render performance: findings and changes

Where making a video spends its time, what was changed about it and why, and what was
looked at and left alone.

## Summary

| #   | Change                                                    | Gain                                                                | Changes the picture                         | Status |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------- | ------ |
| 1   | In the browser, leave the composed map levels to the GPU  | With change 6: three of four demo videos in 35–50% less time        | No (differences below what the eye sees)    | Built  |
| 2   | Release a zoom level once the camera no longer shows it   | Up to 20% for videos of hundreds of activities; removes a 1 s stall | No, pixel for pixel                         | Built  |
| 3   | For the preview picture, set up only what its frame shows | Preview drawn in about half the time                                | No, pixel for pixel                         | Built  |
| 4   | Leave out route points a zoom level cannot show           | Setup 40% shorter for hundreds of activities; Highlight 20% faster  | Yes: zoomed-out routes smoother and thinner | Built  |
| 5   | Stop with a message when the GPU resets during a video    | No speed gain: before, the video then never finished                | No                                          | Built  |
| 6   | Move the progress bar without a transition                | By itself 8–27% less time; counted in the figure of change 1        | No                                          | Built  |

After changes 1, 2 and 6 most videos are made at about 10 ms per frame on a desktop: a 30
second video in about 10 seconds.

## How it was measured

- A 6-core laptop processor from 2019 (Intel Core i7-9850H) with integrated graphics (UHD
  Graphics 630), on Linux.
- Chrome 157. On this system Chrome draws canvases on the GPU and encodes H.264 in
  software (it has no hardware encoder here).
- **The app itself**: the built web app, driven through its steps with the demo's
  activities, timed from "Make video" until the video is there. Four videos: all 25
  activities All at once, as a Recap and as a Multiday trip (follow camera), and one
  activity as a Highlight (follow camera). Frame size 1080x1920 at 30 frames per second.
- **The drawing and encoding alone**, on a page that shows nothing else, and the engine
  alone in Node 26 with the CLI's canvas (`@napi-rs/canvas` 1.1.0): for the cost of single
  steps and for larger libraries (a month of 13 activities, a year of about 180, about 450
  and 770 activities, an 8-day trip).

The two disagree in one important way: a page that shows nothing else does not slow the
worker down, the app's page did (see change 6). Times of whole videos below are from the
app itself.

Not measured: phones, Safari, Firefox. A phone has a slower processor and a hardware
encoder, so drawing weighs more there than on a desktop.

## Where the time went

### A frame in the browser

A frame is made in four steps:

1. The new pieces of route are stroked onto the heat canvas of every zoom level.
2. Where a level changed, its heat is read back, colored, and written onto the level's
   composed canvas (the map with the colored heat on it).
3. The one or two levels around the camera's zoom are drawn onto the frame, scaled to the
   zoom, then the text and the head dots.
4. The frame goes to the encoder.

What each step costs in Chrome on the machine above, measured alone:

- Steps 1 and 2: 0.1 to 3 ms per frame. Coloring the heat in JavaScript is at most 0.5 ms.
- Step 3 with the frame canvas on the GPU and the composed canvases in memory, as it was:
  scaling on the GPU costs nothing, but a composed canvas that changed is uploaded first,
  whole, on every frame: 2 to 5 ms for a level of 2 megapixels, 4 to 18 ms for one of 5 to
  8 megapixels.
- Step 3 with everything in memory instead: copying a level 1:1 takes 1 ms, drawing it
  scaled 7 ms, the two scaled levels of a cross-fade 10 to 17 ms.
- Step 4: about 7 ms per frame, including reading the frame back from the GPU, and more
  when the whole picture moves.

On top of that, the page held the worker back: while something on the page animates, the
browser gives the worker's GPU work less room. With the progress bar's transition running,
no video was made faster than about 14 ms per frame.

### Setup

- 0.1 to 0.3 s for one activity, and for the follow camera, which draws its map in
  windows during the video.
- 1.3 to 1.6 s for a video with the zoom camera: drawing its 2 to 7 map levels. About half
  of drawing the map goes into forests and close to a fifth into residential areas.
- 3.9 s for 450 activities. Of that, 1.9 s is the probe that draws the finished heatmap
  once to find the heat scale: when the camera can zoom in far, routes keep nearly all
  their points (1.2 million here), and the probe strokes them at the widest view.

### The preview picture

The preview is the video's last frame at 480 pixels. Drawn in Node it took 0.1 to 0.3 s for
one activity or a trip, 0.65 to 0.86 s for a month or a year, 1.6 to 2.9 s for all at once
or for hundreds of activities. It set up every zoom level and added every frame's routes
to all of them, though its frame shows one level, or two.

### The follow camera's map windows

An 8-day trip opens 29 map windows during its 48 seconds: 23 different ones, and 6 that had
just been released. Together they draw 198 megapixels of map, 4.6 times the 43 megapixels
the camera shows, because each window is larger than the frame and overlaps the next. A
window takes 0.25 s to open on average and up to 0.45 s, during one frame.

### The CLI

The CLI's canvas draws nothing until pixels are read, and copies a whole canvas when it is
read after a change. Its frames (12 to 35 ms) are mostly that copying and scaling, not the
engine's own work; ffmpeg encodes on other cores in 2 ms per frame. Changes 2 and 4 help
it as well; nothing here is done for the CLI alone.

## The changes

Time to make each demo video in the app, in Chrome with a GPU:

| Video                        | Frames | Before | Changes 2 and 6 | Changes 1 and 2 | Changes 1, 2 and 6 | All six |
| ---------------------------- | ------ | ------ | --------------- | --------------- | ------------------ | ------- |
| All at once, 25 activities   | 996    | 16.2 s | 11.9 s          | 14.4 s          | 10.2 s             | 10.0 s  |
| Recap, 25 activities         | 996    | 17.4 s | 13.9 s          | 14.4 s          | 9.7 s              | 10.0 s  |
| Multiday trip, 25 activities | 1446   | 30.2 s | 27.9 s          | 19.4 s          | 15.6 s             | 14.4 s  |
| Highlight, one activity      | 546    | 7.3 s  | 7.3 s           | 7.3 s           | 7.1 s              | 5.6 s   |

The Highlight video gains only from change 4: most of its time went into stroking its
route, which keeps the many points its close zoom can show.

Without a GPU (software rendering, as in the browser tests) the same videos take 7.8, 10.3,
23.4 and 6.8 s.

### 1. Leave the composed map levels to the GPU

In `createLevel` (`replay/render.ts`) the composed canvas took its context with the
readback hint. It is read once, for the map's pixels, and only written and shown after
that. Without the hint the browser keeps it on the GPU: updates become small uploads of
what changed, and drawing a level onto the frame stays on the GPU. Heat canvases keep the
hint: they are read back on every frame.

- The picture: the map is then drawn by the GPU. Against the frames before, at most 0.75%
  of the pixels differ by more than 2 of 255 levels, and none by more than 25.
- In Node the hint means nothing: the CLI's output is the same, byte for byte.

Risks:

- **Phones are not measured.** They draw canvases on the GPU too, and uploaded the same
  large canvases on every frame, so the gain should be there as well. To check before a
  release: make the demo videos on a phone with the released app and with this change, and
  compare the time.
- **GPU memory.** The composed canvases move from memory to the GPU: about 40 of the
  108 MB of canvases of a month's video. A canvas larger than the GPU's texture limit
  stays in memory, as before.
- **A GPU reset** empties canvases on the GPU; see change 5.

### 2. Release a zoom level once the camera no longer shows it

The zoom camera only pulls back. A level it has left is never shown again, but it kept
receiving every route until the end, and kept its two canvases and its copy of the map.

For every level, the renderer finds the last frame that shows it, from the camera's path.
Before drawing a frame, and in `skipTo`, it releases the levels whose last frame has
passed, as the follow camera's windows are released. A level no frame shows is never set
up.

- Pixel for pixel the same: every frame of a month's, a year's and one activity's video
  compared in Node.
- 450 activities in turn: 9.6 to 7.1 ms of drawing per frame in Node. A frame that took
  1.1 s in the browser is gone: it drew thousands of strokes that had piled up on a level
  nobody would see again. Other videos gain 0 to 6%.
- Memory is freed as the camera pulls back, where all levels stayed to the end.
- The follow camera's windows are left as they were.

### 3. For the preview picture, set up only what its frame shows

The `lastFrameOnly` option of `prepareReplay` is passed on to the renderer as the one
frame that will be drawn. With it:

- tiles are loaded only for the levels (or, with the follow camera, the windows) that
  frame shows;
- only those levels are set up;
- `skipTo` adds routes only to them, which change 2 gives;
- drawing any other frame is an error.

The web app's preview (`worker/poster.ts`) passes the option.

Pixel for pixel the same picture. Time to draw the preview in Node:

| Selection                   | Before | With change 3 | With changes 3 and 4 |
| --------------------------- | ------ | ------------- | -------------------- |
| One activity, Highlight     | 0.09 s | 0.08 s        |                      |
| A month, 13 activities      | 0.65 s | 0.27 s        |                      |
| A year, 180 activities      | 0.86 s | 0.42 s        |                      |
| A year, all at once         | 1.64 s | 0.73 s        | 0.78 s               |
| Multiday trip, 8 days       | 0.29 s | 0.25 s        |                      |
| 450 activities              | 2.55 s | 1.96 s        | 1.06 s               |
| 770 activities, every sport | 2.92 s | 1.29 s        | 1.22 s               |

In the browser every tile is one read from the cache, so loading fewer of them should
count for more there than in Node.

### 4. Leave out route points a zoom level cannot show

Routes are thinned once, for the closest zoom of the camera: a point closer than 0.35
pixels to the one before it is left out. When the camera can zoom in 30 times, that keeps
points 0.01 pixels apart at the widest level, and every level stroked all of them.

Routes are now thinned per level as well: when a piece of route is stroked onto a level,
the points closer than 0.35 of that level's pixels to the last one drawn are left out; a
piece always keeps its two ends, so pieces still meet. The heat scale probe thins the same
way, as it draws at the widest level's scale. Not when route points are preserved for the
trim radius.

- 450 activities in turn: setup 5.6 to 3.4 s and drawing 7.1 to 5.0 ms per frame in Node;
  setup 3.9 to 2.3 s in Chrome.
- The Highlight demo video is made in 5.6 s instead of 7.1 s: the follow camera strokes the
  route onto its wider levels too, and draws it again whenever it opens a map window.
- The closest level is drawn as before, and so is a video whose camera does not zoom in.

**This changes the look.** On zoomed-out levels the routes come out smoother and a little
thinner, and the heat scale moves slightly (32.5 to 32.0 passes for the 450 activities,
5.16 to 5.06 for the month). In the last frame of the 450 activities, 1.2% of the pixels
differ by more than 2 levels and 0.34% by more than 24.

The reason is in how a frame's piece of route is stroked: with flat ends, so that it meets
the pieces before and after it without overlapping them, and with round joins. Points
much closer together than a pixel, with the noise of a GPS track between them, make the
round joins spill past both ends by up to half the line's width. A piece 3 pixels long
that should cover 27 pixels covers 44 to 90. Where it spills, it overlaps its neighbors
and counts twice. Thinning removes most of those joins, so a pass counts closer to once.
It does so for noise smaller than the gap; a track that wanders by more than a third of
a pixel is still drawn as it wanders.

### 5. Stop with a message when the GPU resets during a video

When the browser's GPU process restarts in the middle of a video, the frame canvas loses
its context and gets it back empty, and the encoder never takes the next frame: the video
stayed at "drawing" until it was canceled.

The worker listens for `contextlost` on every canvas of the video (`worker/video.ts`) and
ends the video with a message that asks to make it again. No speed gain. The browser tests
draw without a GPU, so they cannot check it: it was checked by hand in Chrome with a GPU,
by restarting the GPU process during a video.

### 6. Move the progress bar without a transition

The progress bar of the Export step grew with a 0.2 s transition, restarted at every
update: for as long as a video was made, the page drew 60 times a second. While a page
does that, the browser holds back the GPU work of the worker that draws the video. Without
the transition the bar moves in steps of about 1.5% and the page draws only on an update.

Anything else that animates on the page while a video is made would bring the slowdown
back.

## Looked at and left as it is

- **The frame canvas in memory too.** In the app: All at once in 6.9 s, but the Recap in
  10.8 s and the Multiday trip in 23.9 s, against 10.2, 9.7 and 15.6 s with changes 1, 2
  and 6. Better where a level is copied 1:1, worse where levels are scaled.
- **Thinning the map's shapes.** 0 to 8% of the setup: the tiles are already simplified to
  about a pixel.
- **Head dots drawn from a prepared image.** 450 dots cost 4 ms per frame as gradients;
  only all-at-once videos of hundreds of activities would gain, about 3 ms.
- **Place names.** Under 1 ms per frame.
- **The heat scale's percentile.** 6 to 13 ms, once.
- **Keeping decoded tiles between map windows.** Decoding is a fifth of opening a window,
  but a decoded tile takes far more memory than the tile itself, and would be kept for
  the whole video.
- **Less map drawn for the follow camera.** Its windows draw almost five times the area
  the camera shows. Keeping a window that is needed again right away would save a fifth
  of that for an 8-day trip; drawing the map in fixed squares as the camera reaches them
  could save most of it, and would spread the work over the frames, but it is a new way
  of keeping a level. Worth its own plan: the windows are now the largest part of a
  follow-camera video's drawing.
