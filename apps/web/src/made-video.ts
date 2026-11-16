// The last video made: kept in the page's memory only, never stored.

import type { VideoReport } from './messages.ts';

/** A finished video, kept in memory only, and the settings it was made with. */
export type MadeVideo = {
  /** The MP4 under the name it is downloaded and shared with. */
  file: File;
  /** A blob: address of the file, for the player and the download link. */
  url: string;
  report: VideoReport;
  /** The settings it was made with, as JSON, to tell when they change. */
  settingsKey: string;
};
