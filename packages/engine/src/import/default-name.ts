/**
 * The name of an activity that neither its file nor an activity list names: the part of the
 * day it started in, in local time, and its sport, e.g. "Morning ride" or "Evening activity".
 * Export file names ("10004710540.fit") say nothing, so they are not used.
 */
export function defaultActivityName(sport: string, startTime: number): string {
  const hour = new Date(startTime).getHours();
  const part =
    hour < 5
      ? 'Night'
      : hour < 12
        ? 'Morning'
        : hour < 14
          ? 'Lunch'
          : hour < 18
            ? 'Afternoon'
            : hour < 21
              ? 'Evening'
              : 'Night';
  const words = !sport || sport === 'unknown' ? 'activity' : sport.replace(/-/g, ' ');
  return `${part} ${words}`;
}
