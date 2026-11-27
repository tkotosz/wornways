# Render settings

Status: **agreed**; slider ranges and presets may still be tuned. One list of settings
drives both front ends: the CLI turns flags into these settings, and the web UI builds its
controls from them. The CLI rejects a flag it does not know instead of ignoring it.

The CLI makes videos with one command: `wornways render [<path>...] [flags]`, of the
activities in its library or of the files named.

## How the activities play

The activities play in **groups**, in date order, one group after another, or starting a
little early when Overlap is set. A group is an activity, a calendar day, week or month,
or all of them (see Grouping). A group's activities start together and either finish
together, each drawn over the group's whole time, or move at their real pace on one
clock, so shorter ones finish first (see Group pace). Every activity in one group at real
pace is a race: every activity starts at the same moment, and the headline is the race
clock.

When the selection holds exactly one activity, the video plays that activity at its own
pace with live time and distance: 15 to 60 s depending on how long the activity was, and
never longer than the video length setting.

## Presets

A preset is a named recipe for the timing: `--preset <name>` fills in the settings below,
and a setting given with it wins over its value. The web app offers the same presets in its
Playback section (Highlight for a single activity, the others for several); changing the
video's length or a value under Fine-tune playback makes the preset Custom.
Single- and multi-activity replays remember their timing and camera settings independently.
Use **Reset playback to defaults** under Fine-tune playback for the same starting settings as
`wornways render` without a preset.

| Preset          | What it plays                                                                                  | Settings                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `all-at-once`   | every activity starts at the same moment and moves at its real pace                            | `--group all --group-pace real --duration 30`                                 |
| `recap`         | activities in turn, grouped as needed (a week by activity, a year by month), then their totals | `--group auto --share even --group-pace fit --duration 30 --totals-card`      |
| `multiday-trip` | one day after another, a longer day getting more time, the camera following the route          | `--group day --share distance --group-pace fit --duration 45 --camera follow` |
| `highlight`     | for one activity: a 15-second clip with the camera following the route                         | `--duration 15 --camera follow`                                               |

## Settings

### Which activities

| Setting      | CLI flag         | Values                            | Default                                |
| ------------ | ---------------- | --------------------------------- | -------------------------------------- |
| Period start | `--from`         | `YYYY-MM-DD`, `YYYY-MM` or `YYYY` | first activity                         |
| Period end   | `--to`           | `YYYY-MM-DD`, `YYYY-MM` or `YYYY` | last activity                          |
| Activities   | `--activity`     | activity ids, separated by commas | every activity the other settings keep |
| Sports       | `--sport`        | comma-separated list              | every sport                            |
| Distance min | `--min-distance` | nonnegative kilometres, inclusive | open                                   |
| Distance max | `--max-distance` | nonnegative kilometres, inclusive | open                                   |
| Starts near  | `--start-near`   | `lat,lon`                         | off                                    |
| Start radius | `--start-radius` | 100–20000 m, with `--start-near`  | 1000 m                                 |
| Ends near    | `--end-near`     | `lat,lon`                         | off                                    |
| End radius   | `--end-radius`   | 100–20000 m, with `--end-near`    | 1000 m                                 |

The place filters are independent: activities that start and end at home take the same
place for both; a ride from home to a race takes two. A radius without its place is
refused.

The activity IDs narrow what the other settings choose. The web app sets them when
activities are unticked by hand in its list. Use `--activity-id <id>` for a literal ID
that contains a comma. Repeat the flag to include several literal IDs.

Distance bounds apply before GPS cleaning and privacy trimming. For example,
`--min-distance 5 --max-distance 10` keeps activities from 5 through 10 km. The web app
offers the same bounds in Activities and uses the reported distance for a Strava activity.

A period names whole days, months or years: `--from 2026-10 --to 2026-10` is October 2026.
The web UI offers period shortcuts (today, yesterday, this month, last month, this year, last year,
custom)
that fill in the start and the end. In Custom, enter a day, month or year in either field.

### Timing

The fields beside numeric sliders accept exact values within the same ranges as the CLI.

| Setting      | CLI flag       | Values                                                                                                                                                                  | Default |
| ------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Video length | `--duration`   | 5–60 s, exact                                                                                                                                                           | 30 s    |
| Grouping     | `--group`      | `activity`, `day`, `week` (Monday to Sunday), `month`, `all`; `auto`: the finest of activity, day, week and month that gives every group at least 1.5 s                 | `auto`  |
| Time share   | `--share`      | `even`: every group the same time; `distance`: time grows with the square root of the group's distance                                                                  | `even`  |
| Group pace   | `--group-pace` | `fit`: a group's activities all finish together; `real`: they move at their real pace on one clock that starts slow and speeds up, the longest filling the group's time | `fit`   |
| Overlap      | `--overlap`    | 0–80%: lets the next group start before the current one has finished; at 40% it starts when the current one is 60% drawn                                                | 0%      |
| Drawing pace | `--pace`       | `time` or `distance`                                                                                                                                                    | `time`  |
| End pause    | `--end-pause`  | 0–10 s: the finished picture stays on screen this long after the replay, before the totals card and the end card; added to the video's length                           | 0 s     |

0.4 s of map come before the first group and up to 2.5 s on the finished picture after
the last (at most a tenth of the video; only 0.3 s when the totals card or the end card
follows, as it fades in from the finished picture); the groups share the time in between, each at
least 0.3 s. The headline shows the playing group: an activity's or a day's date, a week's
dates, a month, or the dates all activities span; in a race, the race clock.

End pause adds time on the finished picture, after the replay and before any card, so the
replay keeps its length and draws at the same speed. A 15 s video with a 3 s end pause and
the end card plays 15 s of replay, 3 s on the finished picture, then the end card.

### Replay privacy

| Setting               | CLI flag        | Values   | Default |
| --------------------- | --------------- | -------- | ------- |
| Trim start and finish | `--trim-radius` | 0–2000 m | off     |

In the web app, the slider is in the Map section. It hides at least this radius around the
start and finish of each selected activity. The preview and export keep the longest
continuous section outside the hidden circles.

A hidden circle is not centered on the start or finish itself: every visible route would
begin on its edge, and a few routes from the same place would outline the circle and so
its center. Instead the circle is centered on the nearest point of a fixed grid, spaced
one radius apart, and is about 1.7 times the radius so that it still covers the radius
around the real endpoint. Starts close together share a circle; its center tells only
that they are within half a grid cell of it. Routes are trimmed only around their own
start and finish, so a route that passes another activity's start stays visible there. If GPS cleaning moves an endpoint,
the radius applies to its original and cleaned positions. Activities with less than 200 m left are
omitted. Export shows the visible distance and the number of omitted activities.
Trimmed exports default to the filename `replay.mp4`.

### Look

| Setting           | CLI flag             | Values                                                                                   | Default                    |
| ----------------- | -------------------- | ---------------------------------------------------------------------------------------- | -------------------------- |
| Camera            | `--camera`           | `zoom`, `fixed` or `follow`                                                              | `zoom`                     |
| Street map        | `--map` / `--no-map` | on/off                                                                                   | on                         |
| Frame size        | `--size`             | `WxH`, presets: story 1080x1920, square 1080x1080, landscape 1920x1080                   | story                      |
| Frames per second | `--fps`              | 24, 30, 60                                                                               | 30                         |
| Units             | `--units`            | `metric` or `imperial`                                                                   | metric                     |
| Layout            | `--layout`           | `classic`, `bottom-row`, `corner-grid`, `hero`, `hero-pair`, `side-column`, `story-safe` | the preset's, else classic |

Units: metric tells distances in kilometers, heights in meters, speeds in km/h, paces in
minutes per kilometer and temperatures in °C; imperial in miles, feet, mph, minutes per mile
and °F. They apply to the values over the replay and on the totals card. Heart rate, power,
cadence and calories have no unit to change. In the web app the setting is in the Overlay
and the Ending sections. A value widget can also leave its unit out (`nounit`, see Widgets).

Layout: where the widgets start when `--widgets` leaves them to the video, as slots for the
title, the stats and a chart; in the web app also guides while the widgets are arranged
(never drawn in the video). Classic: a large stat at the bottom left, three under it, a chart
along the bottom. Bottom row: up to four stats side by side at the bottom, a chart over them.
Corner grid: four stats two by two at the bottom left. Hero: a large stat in the middle at
the bottom, three under it. Hero pair: the same with two under it. Side column: the stats down the left side. Story safe: the title,
a chart and the stats clear of what Instagram and TikTok cover on a story (the top 14%, the
bottom 35%). The title goes in its slot at the top. The slots are planned on a story frame
and keep their size in pixels on any other; a chart and the title keep their width. A stat is
sized to fit its slot; a row of centered slots it does not fill is spread about its middle.
Each preset has a layout: Highlight, Recap and Multiday trip Classic, All at once Hero pair.

In the Frame section, choose a frame preset or enter a custom size such as `640x480`. Both
dimensions must be positive even numbers. Available encoder sizes depend on the device.

The follow camera tracks the moving end of the route and pulls back to show the whole
replay at the end. Each activity gets a zoom suited to its pace, and the camera widens
when gliding between distant routes. Activities within each group play in turn, with
time shared by distance. During a group overlap the camera moves to the latest activity
to start. Races use the zoom-out camera, and so do videos whose activities are drawn for
less than a second each (typically a year or more), where following would jump from one
activity to the next every few frames.

### Widgets

What is drawn over the replay is a list of widgets, each centered on a point of the frame
(percent across and down) at a size (50 to 250%, 100 when left out; a chart's width and
height apart as `120x60`), drawn in order:

| Setting | CLI flag    | Values                                                | Default                                                                             |
| ------- | ----------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Title   | `--title`   | text, empty for none                                  | made from the selection                                                             |
| Widgets | `--widgets` | `name@x,y,size` items separated by `;`; `""` for none | the title, the values that suit the video, and for one activity the elevation chart |

A name is `text` (with its own text as `text:"Mallorca"`, else the title), any value of the
table below, or `elevation-chart`. For example
`text@50,6;distance@25,85,120;count:under@60,85;elevation-chart@50,94`. The title is also the
one on the totals card.

A value shows its words in one of these label modes, written after a colon (`count:after`):

| Mode     | Shows                                                | Example                   |
| -------- | ---------------------------------------------------- | ------------------------- |
| `off`    | the value alone                                      | 1,147 km                  |
| `before` | its words, then the value, on one line               | total distance 1,147 km   |
| `after`  | the value, then its words, on one line               | 25 activities             |
| `above`  | the value, with its words smaller on a line above it | total distance / 1,147 km |
| `under`  | the value, with its words smaller on a line under it | 1,147 km / total distance |

Without a mode, a value has its words under it; the date has none. Its words are its usual
ones (see Values) unless it has its own, in double quotes after a colon:
`climb:before:"↑"` writes "↑ 15,423 m", `distance:above:"so far"`, and `count:""` leaves the
words out. `nounit` writes the number without its unit, for a value that has one:
`distance:nounit:"km in total"` writes "1,147" over "km in total". `icon` draws the value's
icon in front of its line, in the line's color: a stopwatch for times, a clock for the start
and the time of day, a road for distances, a gauge for speeds, mountains for the climb,
descent and elevations, a heart, a bolt for power, a crank for cadence, a thermometer, a
flame for calories, a flag for the activities and a calendar for the date and the days
(`distance:icon`).

A time, a date or a clock time is also written in a format of its own, after a colon, alone
or after the label mode (`moving:hm`, `moving:after:hm`):

| Values                                               | Format | Example     |
| ---------------------------------------------------- | ------ | ----------- |
| `time`, `moving`, `avg-time`, `max-time`, `min-time` | `hms`  | 54:38:25    |
|                                                      | `hm`   | 54:38       |
|                                                      | `h`    | 55 h, 1.7 h |
|                                                      | `d`    | 2.3 days    |
| `date`                                               | `dmy`  | 8 May 2026  |
|                                                      | `dm`   | 8 May       |
|                                                      | `wdm`  | Fri 8 May   |
|                                                      | `mdy`  | May 8, 2026 |
|                                                      | `iso`  | 2026-05-08  |
| `start`, `time-of-day`                               | `24h`  | 06:42       |
|                                                      | `12h`  | 6:42 AM     |

Without one, a time is `hms`, a date `dmy` and a clock time `24h`. Hours have a tenth under
10 hours and are whole from 10 on; days have a tenth. Dates the activities span follow the
format ("2 Apr – 8 May 2026", "Thu 2 Apr – Fri 8 May", "Apr 2 – May 8, 2026"), and a month
is "May 2026", "May" or "2026-05".

Without `--widgets`, a video starts with the title at the top in the middle; the values
that suit it, each with its icon, at the bottom left, the first large and the others smaller in a row under it
(one activity: distance, time, climb; a race: race time, still moving, total distance; in
turn: date, total activities, total distance, total climb; one day after another: date,
total distance, total climb, total moving time); and for a single activity with recorded
elevation, the elevation chart along the bottom, with the values above it. The climb needs
recorded elevation.

The elevation chart is the climb over the distance from start to finish. For several
activities it lays them end to end in date order on one height scale (a trip's days side by
side), with a thin tick where one ends and the next begins. Each activity's part is orange
as far as it has been drawn, the rest faint, and a glowing dot moves along the line with
each activity being drawn; with several activities a dot fades once its activity finishes,
as the route's head does. An activity without recorded elevation is bridged by a straight
line between the heights around it; with no elevation at all there is no chart. A climb of
less than 60 m is drawn against a 60 m range, so flat looks flat.

The other charts are drawn the same way along the distance, so the same spot on each is the
same place on the route, each in its own color: `heart-rate-chart` red, `power-chart`
yellow, `speed-chart` blue and `cadence-chart` green; elevation stays orange. A chart takes
another color after a colon: orange, red, yellow, green, blue, purple, pink or white
(`power-chart:blue@50,85`), and `icon` draws its kind's icon at its left end, in its color,
the chart after it (`heart-rate-chart:icon`). The speed is the one the device recorded (FIT's speed, the speed
in GPX and TCX extensions, Strava's smoothed velocity, Ride with GPS's speed), else worked
out from the distance and the recorded time between points; the speed values over the
replay always go by the points. Heart rate, power and cadence need an activity that recorded
them; a chart with nothing to show is left out. Each is smoothed so it reads at a glance,
power the most, and drawn against a least range of 30 bpm, 100 W, 3 m/s or 20 rpm.

### Values

What a value widget can show, by what it measures, with the name the app gives it. A
single-activity video shows live values as the activity plays; a video of several activities
shows running totals. For several activities a plain value is their total ("Total
distance"); `avg-`, `max-` and `min-` time, distance, climb and calories are per activity
("Avg distance per activity": each activity's own, averaged); the speeds, the elevations and
the sensors are over every activity together. The words under a value are its name in lower
case ("total distance"), with the sport's word for an activity ("avg distance per ride"). A
value the video cannot show is left out.

| Value                                                   | One activity                            | Several activities (race / in turn)                      |
| ------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------- |
| `time`                                                  | Time: so far, stops included            | Race time: the race clock / Total time                   |
| `moving`                                                | Moving time                             | Total moving time                                        |
| `avg-time`, `max-time`, `min-time`                      | not offered                             | Avg / Max / Min time per activity                        |
| `start`                                                 | Start time, e.g. "06:42"                | not offered                                              |
| `time-of-day`                                           | Time of day: the clock time as it plays | not offered                                              |
| `distance`                                              | Distance                                | Total distance                                           |
| `avg-distance`, `max-distance`, `min-distance`          | not offered                             | Avg / Max / Min distance per activity                    |
| `avg-speed`                                             | Avg speed, while moving                 | Avg speed, while moving                                  |
| `max-speed`                                             | Max speed, the fastest over 10 s        | Max speed of any activity                                |
| `speed-now`                                             | Current speed, over the last 10 s       | not offered                                              |
| `climb`, `descent`                                      | Climb, Descent                          | Total climb, Total descent                               |
| `avg-climb`, `max-climb`, `min-climb`                   | not offered                             | Avg / Max / Min climb per activity                       |
| `max-elevation`, `min-elevation`                        | Max / Min elevation so far              | Max / Min elevation of any activity so far               |
| `elevation-now`                                         | Current elevation                       | not offered                                              |
| `avg-heart-rate`, `max-heart-rate`, `min-heart-rate`    | Avg / Max / Min heart rate              | Avg / Max / Min heart rate                               |
| `heart-rate-now`                                        | Current heart rate                      | not offered                                              |
| `avg-power`, `max-power`                                | Avg / Max power                         | Avg / Max power                                          |
| `power-now`                                             | Current power                           | not offered                                              |
| `avg-cadence`, `max-cadence`                            | Avg / Max cadence                       | Avg / Max cadence                                        |
| `cadence-now`                                           | Current cadence                         | not offered                                              |
| `avg-temperature`, `min-temperature`, `max-temperature` | Avg / Min / Max temperature             | Avg / Min / Max temperature                              |
| `temperature-now`                                       | Current temperature                     | not offered                                              |
| `calories`                                              | Calories so far                         | Total calories                                           |
| `avg-calories`, `max-calories`, `min-calories`          | not offered                             | Avg / Max / Min calories per activity                    |
| `count`                                                 | not offered                             | Still moving: how many are still out / Total activities  |
| `days`                                                  | not offered                             | Days: from the first activity's day to the last one's    |
| `moving-days`                                           | not offered                             | Moving days: the days with an activity                   |
| `date`                                                  | Date: its day                           | the days the activities span / the playing group's dates |

While a video plays, a minimum per activity counts the activities finished so far (the ones
started until one has), so an activity still under way does not count as the shortest.

The time over the video follows the replay, where long pauses are shortened; the totals
card's time in total keeps every stop as recorded. Moving time counts the stretches covered at
0.5 m/s or faster, so stops do not count; it and the top speed go by the recorded clock, also
with even drawing pace. Top
speed is the fastest average over 10 seconds, so a single point the GPS put too far away
hardly counts; the speed as it plays is the average over the last 10 seconds. The average
speed (`avg-speed`) is over the moving time, as Strava gives it. The start time and the time of
day are in the time zone of the device making the video. Pace and the speeds are minutes
per kilometer when every activity is on foot (run, walk, hike), otherwise kilometers per
hour. Elevation shows only when an activity recorded it.

Heart rate, power, cadence, temperature and calories show only when an activity recorded
them. Averages are over time, so a stretch with many points weighs no more than one with few;
cadence leaves out stretches at zero, such as coasting, and is steps per minute on foot
(rotations per minute otherwise). Calories so far count each activity's share as it plays.
The values come from:

- FIT files: all five.
- TCX files: heart rate, cadence, power and calories.
- GPX files: heart rate, cadence and temperature from Garmin's track point extension, and
  power where an app adds it.
- Strava: heart rate, cadence, power and temperature with the track. Calories take one more
  request per activity, so they are fetched only for a video that shows them, and kept.
- Ride with GPS: heart rate, cadence, power and temperature.

Strava and Ride with GPS tracks downloaded before these values were kept show none until they
are downloaded again.

### Totals card

After the replay, 3.4 s more, before the end card; for one activity too. The
finished map dims, the video's title comes in with a short orange rule under it, and the
totals count up, by default the activities (named after the one sport shown, such as
rides), the kilometers, the hours moving and the meters climbed. Each total is the value a
value widget shows at the end of the replay (see Values).

What it shows is a list of widgets, written as the widgets over the replay are (see
Widgets): text, which without its own text shows the title, and totals for every activity,
named as the values of the metrics table are (any of them for several activities; none of
the ones for one activity as it plays, and no elevation chart). Each is centered on its
point, at a size from 50 to 250%. The text is drawn with the short orange rule under it; a
total is written as a value widget writes it at the end of the replay, large over its words
in orange: "312 km / total distance", "15 h / total moving time", "62.5 km / avg distance
per ride", "178 bpm / max heart rate". A time or a date takes a format as over the replay; a
time is in hours unless told otherwise. A total takes a label mode, words of its own and
`nounit` as a value over the replay does (`distance:nounit:"km together"`). Under is its
usual place; above, the words are over the number; before or after, they stay smaller and
orange on the number's line. The
values fade in in their order, one after another, and count up; the speeds and the dates
appear without counting up, and the dates are drawn smaller. A total the activities did not
record (the climb, the descent and the elevations without elevation, the sensor values,
calories) is left out.

Unless set, the card starts with activities, distance, moving time and climb (`count`,
`distance`, `moving`, `climb`; for one activity distance, moving time and climb, named
without "Total"), each with its icon, without the title, which the map behind it still
shows; a text widget adds it (`text@50,30`). They start in the card's layout
(`--totals-layout`): `grid-2x2` (the usual), `grid-2x3` and `grid-2x4` (rows of two),
`column` (one under another) or `row` (side by side, for a wide frame), centered on the frame
with a slot for the title over them. For one activity the count, the days and the values per
activity are not offered. In the web app they are arranged on the card in the Ending
section, as the widgets over the replay are in Overlay.

The recap preset turns it on; any other video can. In the web app a
Custom playback made from Recap keeps it on, and the switch in the Ending section always
decides over the preset.

| Setting          | CLI flag                             | Values                                                | Default                                                   |
| ---------------- | ------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------- |
| Show totals card | `--totals-card` / `--no-totals-card` | on/off                                                | off; on with `recap`                                      |
| Widgets          | `--totals-widgets`                   | as `--widgets`: `text:"…"@x,y,size`, `distance@x,y,…` | `count`, `distance`, `moving`, `climb`, without the title |

### Branding

The end card: after the replay, 3.2 s more. The finished map fades to black and the
Wornways mark draws itself: the tile appears with the start dot, the route runs through
the double W with a glowing head, the end dot lands and the name fades in. The replay
keeps its duration; the card is added to it. The preview's picture shows the replay's
last frame, not the card; its playable draft has the card.

The watermark: the small mark and name, a little faint, at the bottom left on the map
credit's line, as far from the edge as the credit is on the right, on every frame of the
replay. The widgets a video starts with stay above that line, so they do not meet it or the
credit.

| Setting        | CLI flag                         | Values | Default |
| -------------- | -------------------------------- | ------ | ------- |
| Show end card  | `--end-card` / `--no-end-card`   | on/off | on      |
| Show watermark | `--watermark` / `--no-watermark` | on/off | on      |

### Output (CLI only)

| Setting     | CLI flag | Default                   |
| ----------- | -------- | ------------------------- |
| Output file | `--out`  | named after the selection |

## Left out on purpose

- Acceleration through the video (later groups played faster than earlier ones): groups
  keep a steady pace, so grouping, time share and overlap say all there is to it.
- Day numbers ("Day 1, Day 2…") for trips: a day grouping labels days with their dates.
- A speed factor ("n times real speed"): the video length is easier to reason about.
- "Only the last n activities": a period covers the same need.
