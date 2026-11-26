// The activity sources by name, as the menu, the popups and the top bar call them.
import type { Source } from './messages.ts';

export const SOURCE_NAMES: Record<Source, string> = {
  files: 'Files',
  strava: 'Strava',
  rwgps: 'Ride with GPS',
  demo: 'Demo',
};
