/** Values per point in `Track.points`: lon, lat, ele, tSeconds. */
export const STRIDE = 4;

/** A value some devices record at every point, besides position, elevation and time. */
export type SensorChannel = 'heartRate' | 'power' | 'cadence' | 'temperature' | 'speed';
/** Speed comes last, so the channels' order stays the one stored records were written in. */
export const SENSOR_CHANNELS: readonly SensorChannel[] = [
  'heartRate',
  'power',
  'cadence',
  'temperature',
  'speed',
];
/**
 * The channels an activity recorded, each with one value per point (NaN where a point has
 * none): heart rate in beats per minute, power in watts, cadence in rotations per minute
 * (one leg's strides on foot, as FIT, TCX and Strava give it), temperature in degrees
 * Celsius, and speed in meters per second as the device measured it (a wheel sensor, or its
 * own reading of GPS); only the speed chart takes the speed, the speed values take the
 * distance between points.
 */
export type Sensors = Partial<Record<SensorChannel, Float32Array>>;

export type Track = {
  id: string;
  name?: string;
  /** Lower-case slug: ride, virtual-ride, run, walk, hike, ... */
  sport: string;
  /** Epoch milliseconds of the first point. */
  startTime: number;
  /** Packed [lon, lat, ele, tSeconds] per point; tSeconds counts from the first point. */
  points: Float64Array;
  /** Values recorded at each point besides the position, when the activity has any. */
  sensors?: Sensors;
  /** Kilocalories the activity burned, when its file or service gives them. */
  calories?: number;
  /**
   * Set while a video is made, when the points' clock is no longer the recorded one (even
   * pace): the recorded seconds of each point, for values that need real time.
   */
  recorded?: Float64Array;
  /**
   * Set while a video is made: the recorded duration in seconds, stops included, before
   * cleaning shortened long pauses.
   */
  elapsedSeconds?: number;
};

/** What a file parser returns: a track without the identity the caller assigns. */
export type ParsedActivity = Pick<
  Track,
  'sport' | 'startTime' | 'points' | 'sensors' | 'calories'
> & {
  /** The name the file gives the activity, if it has one. */
  name?: string;
};

export function pointCount(track: Pick<Track, 'points'>): number {
  return track.points.length / STRIDE;
}
