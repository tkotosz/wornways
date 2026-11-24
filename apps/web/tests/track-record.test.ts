import { describe, expect, it } from 'vitest';
import { trackFromStreams } from '../src/worker/strava-track.ts';
import { decodeTrack, encodeTrack } from '../src/worker/track-record.ts';

const points = Float64Array.from([19, 47.5, 100, 0, 19.001, 47.5, 101, 10, 19.002, 47.5, NaN, 20]);

describe('cached track records', () => {
  it('round-trip a track without sensor values in the first layout', () => {
    const record = encodeTrack({ startTime: 1_000, points });
    expect(record.length).toBe(1 + points.length);
    expect(decodeTrack(record)).toEqual({ startTime: 1_000, points });
  });

  it('round-trip sensor values after the points', () => {
    const sensors = {
      heartRate: Float32Array.from([120, NaN, 130]),
      temperature: Float32Array.from([18, 19, 20]),
    };
    const decoded = decodeTrack(encodeTrack({ startTime: 1_000, points, sensors }))!;
    expect(Array.from(decoded.points)).toEqual(Array.from(points));
    expect(Object.keys(decoded.sensors!).sort()).toEqual(['heartRate', 'temperature']);
    expect(Array.from(decoded.sensors!.heartRate!)).toEqual([120, NaN, 130]);
    expect(Array.from(decoded.sensors!.temperature!)).toEqual([18, 19, 20]);
  });

  it('turn away damaged records', () => {
    expect(decodeTrack(Float64Array.from([NaN, ...points]))).toBeUndefined();
    expect(decodeTrack(Float64Array.from([1_000, ...points, 5]))).toBeUndefined();
    expect(decodeTrack(Float64Array.from([1_000, NaN, 0, ...points]))).toBeUndefined();
  });
});

describe('Strava streams', () => {
  const activity = { id: '1', name: 'Ride', sport: 'ride', startTime: 0, distanceM: 0 };

  it('keep heart rate, cadence, power and temperature with their points', () => {
    const track = trackFromStreams(activity, {
      latlng: {
        data: [
          [47.5, 19],
          [91, 19],
          [47.5, 19.001],
        ],
      },
      time: { data: [0, 5, 10] },
      heartrate: { data: [120, 999, 125] },
      cadence: { data: [80, 81, 0] },
      watts: { data: [200, 0, 220] },
      temp: { data: [18, 18, 19] },
    })!;
    // The point with no valid position goes, its values with it.
    expect(Array.from(track.sensors!.heartRate!)).toEqual([120, 125]);
    expect(Array.from(track.sensors!.cadence!)).toEqual([80, 0]);
    expect(Array.from(track.sensors!.power!)).toEqual([200, 220]);
    expect(Array.from(track.sensors!.temperature!)).toEqual([18, 19]);
  });

  it('leave sensors out when no stream has values', () => {
    const track = trackFromStreams(activity, {
      latlng: {
        data: [
          [47.5, 19],
          [47.5, 19.001],
        ],
      },
      time: { data: [0, 10] },
    })!;
    expect(track.sensors).toBeUndefined();
  });
});
