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

| Preset          | What it plays                                                               | Settings                                                      |
| --------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `all-at-once`   | every activity starts at the same moment and moves at its real pace         | `--group all --group-pace real --duration 30`                 |
| `recap`         | activities in turn, grouped as needed (a week by activity, a year by month) | `--group auto --share even --group-pace fit --duration 30`    |
| `multiday-trip` | one day after another, a longer day getting more time                       | `--group day --share distance --group-pace fit --duration 45` |
| `highlight`     | for one activity: a 15-second clip with the camera following the route      | `--duration 15 --camera follow`                               |

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

The activity ids narrow what the other settings choose; the web app sets them when
activities are unticked by hand in its list.

Distance bounds apply before GPS cleaning and privacy trimming. For example,
`--min-distance 5 --max-distance 10` keeps activities from 5 through 10 km. The web app
offers the same bounds in Activities and uses the reported distance for a Strava activity.

A period names whole days, months or years: `--from 2026-10 --to 2026-10` is October 2026.
The web UI offers period shortcuts (today, yesterday, this month, last month, this year, last year,
custom)
that fill in the start and the end. In Custom, enter a day, month or year in either field.

### Timing

| Setting      | CLI flag       | Values                                                                                                                                                                  | Default |
| ------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Video length | `--duration`   | 5–60 s, exact                                                                                                                                                           | 30 s    |
| Grouping     | `--group`      | `activity`, `day`, `week` (Monday to Sunday), `month`, `all`; `auto`: the finest of activity, day, week and month that gives every group at least 1.5 s                 | `auto`  |
| Time share   | `--share`      | `even`: every group the same time; `distance`: time grows with the square root of the group's distance                                                                  | `even`  |
| Group pace   | `--group-pace` | `fit`: a group's activities all finish together; `real`: they move at their real pace on one clock that starts slow and speeds up, the longest filling the group's time | `fit`   |
| Overlap      | `--overlap`    | 0–80%: lets the next group start before the current one has finished; at 40% it starts when the current one is 60% drawn                                                | 0%      |
| Drawing pace | `--pace`       | `time` or `distance`                                                                                                                                                    | `time`  |

0.4 s of map come before the first group and up to 2.5 s on the finished picture after
the last (at most a tenth of the video; only 0.3 s when the end card follows, as it fades
in from the finished picture); the groups share the time in between, each at
least 0.3 s. The headline shows the playing group: an activity's or a day's date, a week's
dates, a month, or the dates all activities span; in a race, the race clock.

### Replay privacy

| Setting               | CLI flag        | Values   | Default |
| --------------------- | --------------- | -------- | ------- |
| Trim start and finish | `--trim-radius` | 0–2000 m | off     |

In the web app, the slider is under Appearance. It uses the same radius around the
start and finish of each selected activity. The preview and export keep the longest
continuous section outside both circles. Activities with less than 200 m left are
omitted. Export shows the visible distance and the number of omitted activities.
Trimmed exports default to the filename `replay.mp4`.

### Look

| Setting           | CLI flag             | Values                                                                 | Default |
| ----------------- | -------------------- | ---------------------------------------------------------------------- | ------- |
| Camera            | `--camera`           | `zoom`, `fixed` or `follow`                                            | `zoom`  |
| Street map        | `--map` / `--no-map` | on/off                                                                 | on      |
| Frame size        | `--size`             | `WxH`, presets: story 1080x1920, square 1080x1080, landscape 1920x1080 | story   |
| Frames per second | `--fps`              | 24, 30, 60                                                             | 30      |

In Appearance, choose a frame preset or enter a custom size such as `640x480`. Both
dimensions must be positive even numbers. Available encoder sizes depend on the device.

The follow camera tracks the moving end of the route and pulls back to show the whole
replay at the end. Each activity gets a zoom suited to its pace, and the camera widens
when gliding between distant routes. Activities within each group play in turn, with
time shared by distance. During a group overlap the camera moves to the latest activity
to start. Races use the zoom-out camera.

### Title

| Setting        | CLI flag           | Values                                                                                | Default                 |
| -------------- | ------------------ | ------------------------------------------------------------------------------------- | ----------------------- |
| Title          | `--title`          | text, empty for none                                                                  | made from the selection |
| Title position | `--title-position` | `top-`, `middle-` or `bottom-` with `left`, `center` or `right`, e.g. `middle-center` | `top-left`              |
| Title size     | `--title-size`     | 50–200%                                                                               | 100%                    |

Where the title would meet the metrics card (the same edge, and the same side or either in the
middle), the two stack, the title first.

### Metrics card

The values shown over the map: the first one large, the others on a line under it that
wraps when the frame is too narrow. A single-activity video shows live values as the
activity plays; a video of several activities shows running totals.

| Setting   | CLI flag                     | Values                                                                                        | Default              |
| --------- | ---------------------------- | --------------------------------------------------------------------------------------------- | -------------------- |
| Show card | `--metrics` / `--no-metrics` | on/off                                                                                        | on                   |
| Values    | `--metrics-fields`           | comma-separated, in the order shown: `time`, `distance`, `pace`, `elevation`, `date`, `count` | what suits the video |
| Position  | `--metrics-position`         | `top-`, `middle-` or `bottom-` with `left`, `center` or `right`, e.g. `middle-center`         | `bottom-left`        |
| Card size | `--metrics-size`             | 50–200%                                                                                       | 100%                 |

### Branding

The end card: after the replay, 3.2 s more. The finished map fades to black and the
Wornways mark draws itself: the tile appears with the start dot, the route runs through
the double W with a glowing head, the end dot lands and the name fades in. The replay
keeps its duration; the card is added to it. The preview shows the replay's last frame,
not the card.

The watermark: the small mark and name, a little faint, at the bottom right on the map
credit's line, left of the credit (alone at the bottom right without a map), on every
frame of the replay. Nothing else is drawn on that line, so it never meets the title or
the metrics card.

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
