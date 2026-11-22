import { describe, expect, it } from 'vitest';
import { listedTrip, trackFromTrip, tripSport } from '../src/worker/ridewithgps-trip.ts';

const row = {
  id: 11,
  name: 'Coast loop',
  departed_at: '2026-05-02T08:00:00-07:00',
  activity_type: 'cycling:gravel',
  distance: 40237,
  first_lat: 45.5,
  first_lng: -122.6,
  last_lat: 45.52,
  last_lng: -122.65,
  stationary: false,
  updated_at: '2026-05-03T10:00:00-07:00',
};

describe('Ride with GPS trips', () => {
  it('get the sport names files use', () => {
    expect(tripSport('cycling:road')).toBe('ride');
    expect(tripSport('cycling:mountain')).toBe('mountain-bike-ride');
    expect(tripSport('running:trail')).toBe('trail-run');
    expect(tripSport('walking:hiking')).toBe('hike');
    expect(tripSport('cycling:something_new')).toBe('ride');
    expect(tripSport('training:yoga')).toBe('workout');
    expect(tripSport(null)).toBe('unknown');
  });

  it('are listed with their id, sport, both ends, and when they last changed', () => {
    expect(listedTrip(row)).toEqual({
      summary: {
        id: 'rwgps-11',
        name: 'Coast loop',
        sport: 'gravel-ride',
        startTime: Date.parse('2026-05-02T15:00:00Z'),
        distanceM: 40237,
      },
      start: { lat: 45.5, lon: -122.6 },
      end: { lat: 45.52, lon: -122.65 },
      version: '2026-05-03T10:00:00-07:00',
    });
  });

  it('without a name get one from their time and sport; without a route, none', () => {
    expect(listedTrip({ ...row, name: ' ' })?.summary.name).toBe('Afternoon gravel ride');
    expect(listedTrip({ ...row, stationary: true })).toBeNull();
    expect(listedTrip({ ...row, departed_at: null })).toBeNull();
  });

  it('become tracks timed from their first point', () => {
    const summary = listedTrip(row)!.summary;
    const track = trackFromTrip(summary, [
      { x: -122.6, y: 45.5, e: 10, t: 1_777_734_000 },
      { x: 200, y: 45.5, t: 1_777_734_001 }, // no valid position
      { x: -122.61, y: 45.51, t: 1_777_734_005 }, // no elevation
      { x: -122.62, y: 45.52, e: 12, t: 1_777_734_002 }, // back in time
      { x: -122.63, y: 45.53, e: 14, t: 1_777_734_010 },
    ])!;
    expect(track.id).toBe('rwgps-11');
    expect(track.startTime).toBe(1_777_734_000_000);
    expect([...track.points]).toEqual([
      -122.6,
      45.5,
      10,
      0,
      -122.61,
      45.51,
      NaN,
      5,
      -122.63,
      45.53,
      14,
      10,
    ]);
    expect(trackFromTrip(summary, [{ x: 1, y: 2, t: 3 }])).toBeNull();
  });
});
