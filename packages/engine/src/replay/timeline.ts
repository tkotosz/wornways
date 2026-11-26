import type { DateFormat } from './formats.ts';

/** When one track is drawn, in seconds of video time. */
export type TimelineEntry = { start: number; duration: number };

/** Decides how much of each track is visible at each moment of the video. */
export type Timeline = {
  mode: 'chronological' | 'race';
  /** Video length in seconds. */
  duration: number;
  /** Fraction of track `index` drawn at video time `t`, 0..1. Never decreases as `t` grows. */
  progress(index: number, t: number): number;
  /** Chronological mode: each track's drawing window. */
  windows?: TimelineEntry[];
  /** Race mode: seconds of activity time elapsed on the shared clock at video time `t`. */
  clock?(t: number): number;
  /** The headline at video time `t` in a date format, e.g. the date of the group playing. */
  label?(t: number, format: DateFormat): string;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function fromWindows(windows: TimelineEntry[], duration: number): Timeline {
  return {
    mode: 'chronological',
    duration,
    windows,
    progress: (index, t) => clamp01((t - windows[index].start) / windows[index].duration),
  };
}

export type ChronologicalOptions = {
  /** Total video length in seconds. */
  duration: number;
  /** Seconds at the end that show the finished heatmap. */
  hold?: number;
  /** Seconds of empty frame before the first track starts. */
  lead?: number;
  /**
   * Share of each track's drawing time during which the next one is already drawing.
   * 0 plays them strictly one after another; 0.5 starts the next one halfway. Below 0.95.
   */
  overlap?: number;
  /** Screen time grows with distance to this power: 0 equal, 0.5 square root, 1 proportional. */
  weight?: number;
  /** How many times slower the first track plays than the last; 1 keeps an even pace. */
  accel?: number;
  /** Shortest drawing window in seconds, so short activities are still visible. */
  minWindow?: number;
};

/**
 * Activities appear one after another in the order given (pass them sorted by date).
 * Each gets screen time in proportion to its distance raised to `weight`, scaled down
 * steadily through the video when `accel` > 1, and starts when the previous one is
 * `1 - overlap` of the way through.
 */
export function chronologicalTimeline(lengthsM: number[], options: ChronologicalOptions): Timeline {
  const hold = options.hold ?? Math.min(2.5, options.duration * 0.1);
  const lead = options.lead ?? Math.min(0.4, options.duration * 0.02);
  const overlap = Math.min(0.95, Math.max(0, options.overlap ?? 0.4));
  const weight = options.weight ?? 0.5;
  const accel = Math.max(1, options.accel ?? 1);
  const minWindow = options.minWindow ?? 0.3;
  const build = Math.max(0.1, options.duration - hold - lead);
  const n = lengthsM.length;

  // Relative drawing time of each track before fitting it to the video.
  const raw = lengthsM.map(
    (m, i) => Math.max(m, 100) ** weight * accel ** (n > 1 ? -i / (n - 1) : 0),
  );
  // Track i starts after the previous ones' non-overlapping parts; the last one runs to the end.
  const span = raw.reduce((sum, r, i) => sum + (i < n - 1 ? r * (1 - overlap) : r), 0);
  const k = build / span;

  let cursor = lead;
  const windows = raw.map((r) => {
    const window = r * k;
    const entry = { start: cursor, duration: Math.max(window, minWindow) };
    cursor += window * (1 - overlap);
    return entry;
  });
  // A long track followed by shorter ones can end after the last one; squeeze every window
  // so that all tracks finish before the hold.
  const end = Math.max(...windows.map((w) => w.start + w.duration));
  const squeeze = Math.min(1, build / (end - lead));
  for (const w of windows) {
    w.start = lead + (w.start - lead) * squeeze;
    w.duration *= squeeze;
  }
  return fromWindows(windows, options.duration);
}

export type RaceOptions = {
  /** Total video length in seconds. */
  duration: number;
  /** Seconds before the clock starts. */
  lead?: number;
  /** Seconds over which the clock eases in from standstill. */
  ramp?: number;
  /** Seconds at the end that show the finished heatmap. */
  hold?: number;
  /** Clock curve: 0 is constant speed; higher starts slower and ends faster. */
  k?: number;
};

/**
 * Every track starts at the same moment and moves at its real pace on one shared clock,
 * so shorter activities finish first and the longest one finishes last.
 *
 * The clock starts slowly and speeds up exponentially: the busy first minutes stay readable
 * and the last long activities don't drag. The curve comes from third-party MIT-licensed
 * code (see THIRD_PARTY_NOTICES.md).
 */
export function raceTimeline(durationsS: number[], options: RaceOptions): Timeline {
  const longest = Math.max(...durationsS);
  const target = options.duration;
  const lead = options.lead ?? Math.min(1, target * 0.04);
  const ramp = options.ramp ?? Math.min(2, target * 0.08);
  const hold = options.hold ?? Math.min(2.5, target * 0.1);
  const k = options.k ?? 2.3;
  // `run` is the clock's travel in video seconds once the ease-in is accounted for.
  const run = Math.max(Number.EPSILON, target - lead - hold - ramp / 2);
  const duration = lead + run + ramp / 2 + hold;

  function clock(t: number): number {
    const x = t - lead;
    if (x <= 0) return 0;
    let g: number;
    if (ramp > 0 && x < ramp) {
      const s = x / ramp;
      g = ramp * (s ** 3 - s ** 4 / 2); // integral of a smoothstep speed curve
    } else g = x - ramp / 2;
    const u = Math.min(g, run) / run;
    return longest * (k === 0 ? u : (Math.exp(k * u) - 1) / (Math.exp(k) - 1));
  }

  return {
    mode: 'race',
    duration,
    clock,
    progress: (index, t) => (durationsS[index] > 0 ? clamp01(clock(t) / durationsS[index]) : 1),
  };
}

export type Group = {
  /** Indexes of the tracks that play during this group's time; they start together. */
  tracks: number[];
  /** Headline while this group plays in a date format, e.g. "15 Oct 2026" or "March 2026". */
  label: (format: DateFormat) => string;
  /** How much time the group gets relative to the others, e.g. 1 for an even share. */
  share: number;
};

export type GroupOptions = {
  /** Total video length in seconds. */
  duration: number;
  /** Seconds of empty frame before the first group; default the smaller of 0.4 s and 2%. */
  lead?: number;
  /** Seconds on the finished heatmap at the end; default the smaller of 2.5 s and 10%. */
  hold?: number;
  /** Shortest time a group gets, in seconds, so a small one is still seen. Default 0.3. */
  minWindow?: number;
  /**
   * Each track's real duration in seconds. When given, a group's tracks move at their real
   * pace on one race clock (see `raceTimeline`), sped up so that the group's longest track
   * fills the group's time; shorter ones finish earlier. Otherwise each track is drawn
   * over the group's whole time.
   */
  realSeconds?: number[];
  /** When given, tracks within each group play in turn, weighted by these distances. */
  sequentialDistances?: number[];
  /**
   * How much of a group's time the next group starts early, 0 to below 1: 0.4 starts the
   * next group when this one is 60% through. Default 0, one strictly after another.
   */
  overlap?: number;
};

/**
 * Groups played one after another, filling `duration` exactly: each group gets time in
 * proportion to its share (but at least `minWindow`), and its tracks start together and are
 * fully drawn by the end of that time. The next group starts when this one is done, or
 * earlier by `overlap`.
 */
export function groupTimeline(
  groups: Group[],
  trackCount: number,
  options: GroupOptions,
): Timeline {
  const { duration } = options;
  const lead = options.lead ?? Math.min(0.4, duration * 0.02);
  const hold = options.hold ?? Math.min(2.5, duration * 0.1);
  const minWindow = options.minWindow ?? 0.3;
  const build = Math.max(0.1, duration - lead - hold);

  const overlap = options.overlap ?? 0;

  // Each group's time: its share of the build time, raised to the minimum, then all scaled
  // together so that, one after another (less the overlaps), they fill the build time.
  const total = groups.reduce((sum, g) => sum + g.share, 0);
  const raised = groups.map((g) => Math.max((build * g.share) / total, minWindow));
  const last = groups.length - 1;
  const fit = build / raised.reduce((sum, s, i) => sum + (i < last ? s * (1 - overlap) : s), 0);
  const starts: number[] = [];
  const lengths: number[] = [];
  let cursor = lead;
  for (const r of raised) {
    starts.push(cursor);
    lengths.push(r * fit);
    cursor += r * fit * (1 - overlap);
  }
  // Overlapping, a long group followed by shorter ones can end after the last one: squeeze
  // every group so that all finish before the hold.
  if (overlap > 0) {
    const end = Math.max(...starts.map((start, i) => start + lengths[i]));
    const squeeze = Math.min(1, build / (end - lead));
    starts.forEach((start, i) => {
      starts[i] = lead + (start - lead) * squeeze;
      lengths[i] *= squeeze;
    });
  }

  const windows = Array.from({ length: trackCount }, () => ({ start: lead, duration: build }));
  /** How far each track is drawn at a time, 0 to 1. */
  const progress: ((t: number) => number)[] = [];
  groups.forEach((group, i) => {
    const start = starts[i];
    const length = lengths[i];
    if (options.sequentialDistances) {
      const weights = group.tracks.map((k) => Math.max(1, options.sequentialDistances![k]));
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      let cursor = start;
      group.tracks.forEach((k, j) => {
        const window = { start: cursor, duration: (length * weights[j]) / total };
        windows[k] = window;
        progress[k] = (t) => clamp01((t - window.start) / window.duration);
        cursor += window.duration;
      });
      return;
    }
    const race = options.realSeconds
      ? raceTimeline(
          group.tracks.map((k) => options.realSeconds![k]),
          { duration: length, lead: 0, hold: 0 },
        )
      : null;
    group.tracks.forEach((k, j) => {
      windows[k] = { start, duration: length };
      progress[k] = race
        ? (t) => (t < start ? 0 : race.progress(j, t - start))
        : (t) => clamp01((t - start) / length);
    });
  });

  return {
    mode: 'chronological',
    duration,
    windows,
    progress: (index, t) => progress[index](t),
    label: (t, format) => {
      // The last group that has started; the first one before any has.
      let i = 0;
      while (i + 1 < groups.length && starts[i + 1] <= t) i++;
      return groups[i].label(format);
    },
  };
}
