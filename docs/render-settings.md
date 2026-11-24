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
and a setting given with it wins over its value. The web app offers the same presets on
its Playback step (Highlight for a single activity, the others for several); changing the
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

In the web app, the slider is under Appearance. It hides at least this radius around the
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

| Setting           | CLI flag                                         | Values                                                                 | Default                                   |
| ----------------- | ------------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------- |
| Camera            | `--camera`                                       | `zoom`, `fixed` or `follow`                                            | `zoom`                                    |
| Street map        | `--map` / `--no-map`                             | on/off                                                                 | on                                        |
| Elevation profile | `--elevation-profile` / `--no-elevation-profile` | on/off                                                                 | on for a single activity, off for several |
| Frame size        | `--size`                                         | `WxH`, presets: story 1080x1920, square 1080x1080, landscape 1920x1080 | story                                     |
| Frames per second | `--fps`                                          | 24, 30, 60                                                             | 30                                        |

In Appearance, choose a frame preset or enter a custom size such as `640x480`. Both
dimensions must be positive even numbers. Available encoder sizes depend on the device.

The elevation profile is the climb along the bottom of the frame, between the side margins
and just above the map credit, over the distance from start to finish. It is on by default
for a single activity and off for several, where switching it on lays the activities end to
end in date order on one height scale (a trip's days side by side), with a thin tick where
one ends and the next begins. Each activity's part is orange as far as it has been drawn,
the rest faint, and a glowing dot moves along the line with each activity being drawn; with
several activities a dot fades once its activity finishes, as the route's head does. An
activity without recorded elevation is bridged by a straight line between the heights
around it; with no elevation at all there is no profile. A profile that rises less than
60 m is drawn against a 60 m range, so flat looks flat. The metrics card and the title,
when they sit at the bottom, go above it.

The follow camera tracks the moving end of the route and pulls back to show the whole
replay at the end. Each activity gets a zoom suited to its pace, and the camera widens
when gliding between distant routes. Activities within each group play in turn, with
time shared by distance. During a group overlap the camera moves to the latest activity
to start. Races use the zoom-out camera, and so do videos whose activities are drawn for
less than a second each (typically a year or more), where following would jump from one
activity to the next every few frames.

### Title

| Setting        | CLI flag           | Values                                                                                | Default                 |
| -------------- | ------------------ | ------------------------------------------------------------------------------------- | ----------------------- |
| Title          | `--title`          | text, empty for none                                                                  | made from the selection |
| Title position | `--title-position` | `top-`, `middle-` or `bottom-` with `left`, `center` or `right`, e.g. `middle-center` | `top-center`            |
| Title size     | `--title-size`     | 50–200%                                                                               | 100%                    |

Where the title would meet the metrics card (the same edge, and the same side or either in the
middle), the two stack, the title first.

### Metrics card

The values shown over the map: the first one large, the others on a line under it that
wraps when the frame is too narrow. A single-activity video shows live values as the
activity plays; a video of several activities shows running totals.

| Value            | One activity                       | Race (all at once)           | In turn (groups)             | Totals card                    |
| ---------------- | ---------------------------------- | ---------------------------- | ---------------------------- | ------------------------------ |
| `time`           | its time so far                    | the race clock               | the activities' time so far  | hours in total, stops included |
| `moving`         | its moving time so far             | moving time so far           | moving time so far           | hours moving                   |
| `distance`       | kilometers so far                  | kilometers so far            | kilometers so far            | kilometers                     |
| `pace`           | average so far                     | average so far               | average so far               | average while moving           |
| `top-speed`      | top speed so far                   | top speed so far             | top speed so far             | top speed of any activity      |
| `elevation`      | meters climbed so far              | meters climbed so far        | meters climbed so far        | meters climbed                 |
| `descent`        | meters descended so far            | meters descended so far      | meters descended so far      | meters descended               |
| `highest`        | highest point so far               | highest point so far         | highest point so far         | highest point                  |
| `date`           | its day                            | the days the activities span | the playing group's dates    | the days the activities span   |
| `start`          | its start time, e.g. "06:42 start" | not offered                  | not offered                  | not offered                    |
| `count`          | not offered                        | how many are still moving    | activities so far            | activities                     |
| `days`           | not offered                        | days with an activity        | days with an activity so far | days with an activity          |
| `longest`        | not offered                        | longest so far               | longest activity so far      | longest activity               |
| `heart-rate`     | average so far                     | average so far               | average so far               | average                        |
| `max-heart-rate` | highest so far                     | highest so far               | highest so far               | highest                        |
| `power`          | average so far                     | average so far               | average so far               | average                        |
| `cadence`        | average so far                     | average so far               | average so far               | average                        |
| `temperature`    | average so far                     | average so far               | average so far               | average                        |
| `calories`       | so far                             | so far                       | so far                       | in total                       |

The time over the video follows the replay, where long pauses are shortened; the totals
card's time in total keeps every stop as recorded. Moving time counts the stretches covered at
0.5 m/s or faster, so stops do not count; it and the top speed go by the recorded clock, also
with even drawing pace. Top
speed is the fastest average over 10 seconds, so a single point the GPS put too far away
hardly counts. The start time is in the time zone of the device making the video. Pace and
top speed are minutes per kilometer when every activity is on foot (run, walk, hike), otherwise
kilometers per hour. Elevation shows only when an activity recorded it.

Heart rate, power, cadence, temperature and calories show only when an activity recorded
them. Averages are over time, so a stretch with many points weighs no more than one with few;
cadence leaves out stretches at zero, such as coasting, and is steps per minute on foot
(rotations per minute otherwise). Calories so far count each activity's share as it plays.
The values come from FIT files (all five), TCX files (heart rate, cadence, power, calories),
GPX files (heart rate, cadence and temperature from Garmin's track point extension, and power
where an app adds it), Strava (heart rate, cadence, power, temperature; no calories, which
would need one more request per activity) and Ride with GPS (heart rate, cadence, power,
temperature). Strava and Ride with GPS tracks downloaded before these values were kept show
none until they are downloaded again. Unless picked, the
video shows what suits it (one activity: time, distance, date; a race: time, count,
distance; in turn: date, count, distance) and the totals card its first four values.

| Setting   | CLI flag                     | Values                                                                                | Default              |
| --------- | ---------------------------- | ------------------------------------------------------------------------------------- | -------------------- |
| Show card | `--metrics` / `--no-metrics` | on/off                                                                                | on                   |
| Values    | `--metrics-fields`           | comma-separated, in the order shown: any value of the table above                     | what suits the video |
| Position  | `--metrics-position`         | `top-`, `middle-` or `bottom-` with `left`, `center` or `right`, e.g. `middle-center` | `bottom-left`        |
| Card size | `--metrics-size`             | 50–200%                                                                               | 100%                 |

### Totals card

For a video of several activities: after the replay, 3.4 s more, before the end card. The
finished map dims, the video's title comes in with a short orange rule under it, and the
totals count up, by default the activities (named after the one sport shown, such as
rides), the kilometers, the hours moving and the meters climbed. Each total is the value the
metrics card shows at the end of the replay.

Its values can be picked and ordered from the metrics card's values (see the table above),
as totals for every activity. Unless picked, it shows activities, kilometers, hours moving and
meters climbed (`count`, `distance`, `moving`, `elevation`). The pace and the dates appear
without counting up, and the dates take a row of their own. The climb, the descent and the
highest point are left out when no activity recorded elevation, whatever is picked. Up to two
values sit in a row on a story or square frame, up to four on a wide one. In the web app the
values are chips under the switch, numbered in the order picked, with a link back to the
automatic choice.

The recap preset turns it on; any other video of several activities can. In the web app a
Custom playback made from Recap keeps it on, and the switch on the Appearance step always
decides over the preset.

| Setting          | CLI flag                             | Values                                                              | Default                                    |
| ---------------- | ------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------ |
| Show totals card | `--totals-card` / `--no-totals-card` | on/off                                                              | off; on with `recap`                       |
| Values           | `--totals-fields`                    | comma-separated, in the order shown: any value of the metrics table | `count`, `distance`, `moving`, `elevation` |

### Branding

The end card: after the replay, 3.2 s more. The finished map fades to black and the
Wornways mark draws itself: the tile appears with the start dot, the route runs through
the double W with a glowing head, the end dot lands and the name fades in. The replay
keeps its duration; the card is added to it. The preview's picture shows the replay's
last frame, not the card; its playable draft has the card.

The watermark: the small mark and name, a little faint, at the bottom left on the map
credit's line, as far from the edge as the credit is on the right, on every frame of the
replay. Nothing else is drawn on that line, so it never meets the title, the metrics card
or the credit.

| Setting        | CLI flag                         | Values | Default |
| -------------- | -------------------------------- | ------ | ------- |
| Show end card  | `--end-card` / `--no-end-card`   | on/off | on      |
| Show watermark | `--watermark` / `--no-watermark` | on/off | on      |

### Output (CLI only)

| Setting     | CLI flag | Default                   |
| ----------- | -------- | ------------------------- |
| Output file | `--out`  | named after the selection |

## Left out on purpose

- A choice of layouts for the metrics card: the line under the large value wraps on its
  own, which covers narrow frames and large text.
- Acceleration through the video (later groups played faster than earlier ones): groups
  keep a steady pace, so grouping, time share and overlap say all there is to it.
- Day numbers ("Day 1, Day 2…") for trips: a day grouping labels days with their dates.
- A speed factor ("n times real speed"): the video length is easier to reason about.
- "Only the last n activities": a period covers the same need.
