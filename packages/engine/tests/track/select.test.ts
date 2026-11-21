import { describe, expect, it } from 'vitest';
import { parseSettings } from '../../src/replay/settings.ts';
import { trackLengthM } from '../../src/track/clean.ts';
import { distanceM, metresPerDegree } from '../../src/track/geo.ts';
import type { LatLon } from '../../src/track/places.ts';
import { selectTracks } from '../../src/track/select.ts';
import { hiddenCircle } from '../../src/track/trim.ts';
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

/** The position of point `i` of a track. */
const at = (track: Track, i: number): LatLon => ({
  lat: track.points[i * STRIDE + 1]!,
  lon: track.points[i * STRIDE]!,
});
const metres = (a: LatLon, b: LatLon) => distanceM(a.lat, a.lon, b.lat, b.lon);
/** How far a point is from the edge of the circle hidden around `endpoint`. */
const offEdge = (point: LatLon, endpoint: LatLon, radius: number) => {
  const circle = hiddenCircle(endpoint, radius);
  return metres(point, circle.centre) - circle.radius;
};
/** The shortest distance from any point of the track to `place`. */
const closest = (track: Track, place: LatLon) =>
  Math.min(...Array.from({ length: pointCount(track) }, (_, i) => metres(at(track, i), place)));

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

  it('combines inclusive distance bounds with the other filters before trimming', () => {
    const run = library.find((track) => track.id === 'run')!;
    const exactKm = String(trackLengthM(run) / 1000);
    const short = activity({ id: 'short', day: 5, sport: 'run', lengthM: 3_000 });
    const selection = selectTracks(
      [...library, short],
      parseSettings({
        sport: 'run',
        'min-distance': exactKm,
        'max-distance': exactKm,
        'trim-radius': '500',
      }),
    );
    expect(ids(selection.tracks)).toEqual(['run']);
    expect(trackLengthM(selection.tracks[0]!)).toBeLessThan(Number(exactKm) * 1000);
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
      const [start, end] = [at(original, 0), at(original, pointCount(original) - 1)];
      // Cut where the route leaves the hidden circles, never within 500 m of its ends.
      expect(offEdge(at(track, 0), start, 500)).toBeCloseTo(0, 1);
      expect(offEdge(at(track, pointCount(track) - 1), end, 500)).toBeCloseTo(0, 1);
      expect(closest(track, start)).toBeGreaterThanOrEqual(500);
      expect(closest(track, end)).toBeGreaterThanOrEqual(500);
      expect(trackLengthM(track)).toBeLessThan(5_000);
      expect(track.points[3]).toBe(0);
      expect(track.points.at(-1)).toBeCloseTo(trackLengthM(track) / 3);
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
    // The longest part left is the leg west of home, from the edge of the hidden circle.
    expect(offEdge(at(track, 0), HOME, 250)).toBeCloseTo(0, 1);
    expect(at(track, 0).lon).toBeLessThan(HOME.lon - 250 / perLon);
    expect(closest(track, HOME)).toBeGreaterThanOrEqual(250);
    expect(trackLengthM(track)).toBeGreaterThan(2_000);
  });

  it('protects an original endpoint even when GPS cleaning moves it', () => {
    const samples = [
      [0, 0],
      [1_000, 1],
      [2_000, 201],
      [-1_000, 801],
      [-3_000, 1201],
    ];
    const points = new Float64Array(
      samples.flatMap(([east, time]) => [HOME.lon + east / perLon, HOME.lat, 100, time]),
    );
    const original = { ...library[0], points };
    const selection = selectTracks([original], parseSettings({ 'trim-radius': '250' }));
    expect(selection.trimmed[0]?.start).toBe(1);
    const visible = selection.tracks[0];
    expect(offEdge(at(visible, 0), HOME, 250)).toBeCloseTo(0, 1);
    expect(closest(visible, HOME)).toBeGreaterThanOrEqual(250);
    expect(visible.startTime).toBe(original.startTime);
    expect(trackLengthM(visible)).toBeGreaterThan(2_000);
  });

  it('keeps, filters, and trims a route across the date line using local distances', () => {
    const longitudes = [179.999, 179.9995, -180, -179.9995, -179.999, -179.9985];
    const points = new Float64Array(longitudes.flatMap((lon, i) => [lon, 0, 0, i * 20]));
    const route = { ...library[0], points };
    const selection = selectTracks(
      [route],
      parseSettings({
        'start-near': '0,-180',
        'start-radius': '120',
        'max-distance': '0.3',
        'trim-radius': '20',
      }),
    );
    expect(selection.problem).toBeNull();
    const track = selection.tracks[0]!;
    const start = { lat: 0, lon: longitudes[0]! };
    const end = { lat: 0, lon: longitudes.at(-1)! };
    expect(closest(track, start)).toBeGreaterThanOrEqual(20);
    expect(closest(track, end)).toBeGreaterThanOrEqual(20);
    expect(trackLengthM(track)).toBeGreaterThan(100);
    expect(trackLengthM(track)).toBeLessThan(238.3);
  });

  it('does not give away a start shared by several routes', () => {
    // Four rides from one doorstep, heading north, east, south and west.
    const doorstep = { lat: 47.5012, lon: 19.0047 };
    const { perLon: lonM } = metresPerDegree(doorstep.lat);
    const directions = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ];
    const rides = directions.map(([east, north], day) => {
      const points = new Float64Array(201 * STRIDE);
      for (let i = 0; i < 201; i++) {
        const lon = doorstep.lon + (east! * i * 30) / lonM;
        const lat = doorstep.lat + (north! * i * 30) / 110_540;
        points.set([lon, lat, 100, i * 10], i * STRIDE);
      }
      return { ...activity({ id: `ride-${day}`, day: day + 1 }), points };
    });
    const { tracks } = selectTracks(rides, parseSettings({ 'trim-radius': '300' }));
    const circle = hiddenCircle(doorstep, 300);

    expect(tracks).toHaveLength(4);
    for (const track of tracks) {
      // Every route starts on one circle, so its centre can be found, but that centre is a
      // grid point, not the doorstep, which stays at least 300 m from every route.
      expect(metres(at(track, 0), circle.centre)).toBeCloseTo(circle.radius, 1);
      expect(closest(track, doorstep)).toBeGreaterThanOrEqual(300);
    }
    expect(metres(circle.centre, doorstep)).toBeGreaterThan(30);
  });
});

describe('hiddenCircle', () => {
  it('is shared by nearby endpoints and always hides the radius around each', () => {
    const radius = 300;
    const step = 7; // metres
    let shared = 0;
    for (let east = -150; east <= 150; east += step) {
      for (let north = -150; north <= 150; north += step) {
        const point = { lat: 47.3 + north / 110_540, lon: 19.2 + east / perLon };
        const circle = hiddenCircle(point, radius);
        expect(circle.radius - metres(point, circle.centre)).toBeGreaterThanOrEqual(radius);
        if (metres(circle.centre, hiddenCircle({ lat: 47.3, lon: 19.2 }, radius).centre) < 1)
          shared++;
      }
    }
    // A grid cell is one radius wide, so most of this radius-wide square shares one centre.
    expect(shared).toBeGreaterThan(0);
    expect(hiddenCircle({ lat: 47.3, lon: 19.2 }, radius)).toEqual(
      hiddenCircle({ lat: 47.3 + 5 / 110_540, lon: 19.2 + 5 / perLon }, radius),
    );
  });
});
