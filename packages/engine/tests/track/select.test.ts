import { describe, expect, it } from 'vitest';
import { parseSettings } from '../../src/replay/settings.ts';
import { trackLengthM } from '../../src/track/clean.ts';
import { metresPerDegree } from '../../src/track/geo.ts';
import { selectTracks } from '../../src/track/select.ts';
import { STRIDE, pointCount, type Track } from '../../src/track/types.ts';

const HOME = { lat: 47.5, lon: 19 };
const { perLon } = metresPerDegree(HOME.lat);

type Options = { id: string; day: number; sport?: string; startEastM?: number; lengthM?: number };

/**
 * An activity on the given day of August 2026 that heads east in a straight line, one
 * point every 10 s and 30 m, starting `startEastM` meters east of home.
 */
function activity({ id, day, sport = 'ride', startEastM = 0, lengthM = 6_000 }: Options): Track {
  const count = Math.floor(lengthM / 30) + 1;
  const points = new Float64Array(count * STRIDE);
  for (let i = 0; i < count; i++) {
    points.set([HOME.lon + (startEastM + i * 30) / perLon, HOME.lat, 100, i * 10], i * STRIDE);
  }
  return { id, name: id, sport, startTime: new Date(2026, 7, day, 12).getTime(), points };
}

const ids = (tracks: Track[]) => tracks.map((t) => t.id);

describe('selectTracks', () => {
  const library = [
    activity({ id: 'late', day: 20 }),
    activity({ id: 'run', day: 5, sport: 'run' }),
    activity({ id: 'early', day: 2 }),
    activity({ id: 'indoor', day: 3, sport: 'virtual-ride' }),
    activity({ id: 'away', day: 10, startEastM: 40_000 }),
  ];

  it('keeps every sport when none is named, in date order', () => {
    const selection = selectTracks(library, parseSettings({}));

    expect(selection.problem).toBeNull();
    expect(ids(selection.tracks)).toEqual(['early', 'indoor', 'run', 'away', 'late']);
    expect(ids(selection.matched)).toEqual(['late', 'run', 'early', 'indoor', 'away']);
  });

  it('keeps the chosen sports, period or single activity', () => {
    const pick = (input: Parameters<typeof parseSettings>[0]) =>
      ids(selectTracks(library, parseSettings(input)).tracks);

    expect(pick({ sport: 'run' })).toEqual(['run']);
    expect(pick({ sport: 'virtual-ride' })).toEqual(['indoor']);
    expect(pick({ from: '2026-08-05', to: '2026-08-10' })).toEqual(['run', 'away']);
    expect(pick({ activity: 'late' })).toEqual(['late']);
    expect(pick({ activity: 'late,early' })).toEqual(['early', 'late']);
  });

  it('cleans the tracks', () => {
    const selection = selectTracks(library, parseSettings({ activity: 'early' }));

    expect(selection.rawPoints).toBe(201);
    expect(selection.keptPoints).toBe(pointCount(selection.tracks[0]!));
    expect(selection.keptPoints).toBeGreaterThan(100);
  });

  const home = `${HOME.lat},${HOME.lon}`;
  /** A place this many meters east of home, as the settings take it. */
  const east = (m: number) => `${HOME.lat},${HOME.lon + m / perLon}`;

  it('keeps only activities that start near a place and tells how far the others start', () => {
    const selection = selectTracks(library, parseSettings({ 'start-near': home }));

    expect(ids(selection.tracks)).toEqual(['early', 'indoor', 'run', 'late']);
    expect(selection.nearPlaces).toBe(4);
    expect(selection.farAway).toHaveLength(1);
    expect(selection.farAway[0]!.track.id).toBe('away');
    expect(selection.farAway[0]!.startsAwayM).toBeCloseTo(40_000, -2);
    expect(selection.farAway[0]!.endsAwayM).toBeNull();
  });

  it('keeps only activities that end near a place, with its own radius', () => {
    // Every activity heads 6 km east; "away" starts 40 km east and ends 46 km east.
    const pick = (input: Parameters<typeof parseSettings>[0]) =>
      ids(selectTracks(library, parseSettings(input)).tracks);

    expect(pick({ 'end-near': east(46_000) })).toEqual(['away']);
    expect(pick({ 'end-near': east(6_500), 'end-radius': '300' })).toEqual([]);
    expect(pick({ 'end-near': east(6_500), 'end-radius': '600' })).toEqual([
      'early',
      'indoor',
      'run',
      'late',
    ]);
  });

  it('keeps activities from one place to another with both filters', () => {
    const selection = selectTracks(
      library,
      parseSettings({ 'start-near': home, 'end-near': east(46_000), 'end-radius': '2000' }),
    );

    // The ones from home end too far away, and the one ending there starts too far away.
    expect(selection.problem).toBe('nothing-near');
    expect(selection.farAway.find((f) => f.track.id === 'early')).toMatchObject({
      startsAwayM: null,
      endsAwayM: expect.closeTo(40_000, -2),
    });
  });

  it('leaves out an activity that is too short to see', () => {
    const short = activity({ id: 'short', day: 7, lengthM: 120 });
    const selection = selectTracks([...library, short], parseSettings({}));

    expect(ids(selection.tooShort)).toEqual(['short']);
    expect(ids(selection.tracks)).not.toContain('short');
  });

  it.each([
    [{ sport: 'swim' }, 'nothing-matches'],
    [{ 'start-near': '10,10' }, 'nothing-near'],
  ] as const)('reports why %j selects nothing', (input, problem) => {
    const selection = selectTracks(library, parseSettings(input));

    expect(selection.problem).toBe(problem);
    expect(selection.tracks).toEqual([]);
  });

  it('reports when no selected activity is usable', () => {
    const short = activity({ id: 'short', day: 7, lengthM: 120 });

    expect(selectTracks([short], parseSettings({})).problem).toBe('nothing-usable');
  });

  it('trims each route by the same radius and keeps the untrimmed activities for matching', () => {
    const short = activity({ id: 'short', day: 7, lengthM: 900 });
    const setting = parseSettings({ 'trim-radius': '500' });
    const selection = selectTracks([short, ...library], setting);
    expect(selection.privacyOmitted).toBe(1);
    expect(selection.matched[0]).toBe(short);
    expect(selection.tracks).toHaveLength(library.length);
    for (const track of selection.tracks) {
      const original = library.find(({ id }) => id === track.id)!;
      expect(track.points[0]).toBeCloseTo(original.points[0] + 500 / perLon, 9);
      expect(trackLengthM(track)).toBeCloseTo(5_000);
      expect(track.points[3]).toBe(0);
      expect(track.points.at(-1)).toBeCloseTo(5_000 / 3);
      expect(track.startTime).toBe(original.startTime);
    }
    expect(selectTracks([short], setting).problem).toBe('nothing-after-trim');
    expect(selectTracks([short], parseSettings({})).tracks).toHaveLength(1);
  });

  it('separates a section that passes through an endpoint between GPS samples', () => {
    // A straight leg crosses the start circle without any recorded point inside it.
    const positions = [0, 1_000, -1_000, -2_000, -3_000];
    const points = new Float64Array(
      positions.flatMap((east, i) => [HOME.lon + east / perLon, HOME.lat, 100, i * 200]),
    );
    const loop = { ...library[0], points };
    const selection = selectTracks([loop], parseSettings({ 'trim-radius': '250' }));
    const track = selection.tracks[0];
    expect(track.points[0]).toBeCloseTo(HOME.lon - 250 / perLon, 9);
    expect(trackLengthM(track)).toBeCloseTo(2_500);
  });
});
