/** Values per point in `Track.points`: lon, lat, ele, tSeconds. */
export const STRIDE = 4;

export type Track = {
  id: string;
  name?: string;
  /** Lower-case slug: ride, virtual-ride, run, walk, hike, ... */
  sport: string;
  /** Epoch milliseconds of the first point. */
  startTime: number;
  /** Packed [lon, lat, ele, tSeconds] per point; tSeconds counts from the first point. */
  points: Float64Array;
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
export type ParsedActivity = Pick<Track, 'sport' | 'startTime' | 'points'> & {
  /** The name the file gives the activity, if it has one. */
  name?: string;
};

export function pointCount(track: Pick<Track, 'points'>): number {
  return track.points.length / STRIDE;
}
