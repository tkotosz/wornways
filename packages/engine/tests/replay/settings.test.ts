import { describe, expect, it } from 'vitest';
import { SETTINGS, SettingsError, parseSettings } from '../../src/replay/settings.ts';

/** The error `parseSettings` throws for the input, as "setting: message". */
function errorOf(input: Parameters<typeof parseSettings>[0]): string {
  try {
    parseSettings(input);
  } catch (error) {
    if (error instanceof SettingsError) return `${error.setting}: ${error.message}`;
    throw error;
  }
  throw new Error('parseSettings accepted the input');
}

describe('parseSettings', () => {
  it('fills in the defaults', () => {
    expect(parseSettings({})).toEqual({
      from: null,
      to: null,
      activities: null,
      sports: null,
      startNear: null,
      endNear: null,
      duration: 30,
      group: 'auto',
      share: 'even',
      groupPace: 'fit',
      overlap: 0,
      pace: 'time',
      camera: 'zoom',
      map: true,
      title: null,
      width: 1080,
      height: 1920,
      fps: 30,
      metrics: true,
      metricsFields: null,
      metricsPosition: 'bottom-left',
      titlePosition: 'top-left',
      titleSize: 100,
      metricsSize: 100,
      endCard: true,
      watermark: true,
    });
  });

  it('makes a 30 s video unless told otherwise', () => {
    expect(parseSettings({}).duration).toBe(30);
    expect(parseSettings({ duration: '45' }).duration).toBe(45);
  });

  it('reads a period as whole days, months or years in local time', () => {
    const october = parseSettings({ from: '2026-10', to: '2026-10' });
    expect(october.from).toBe(new Date(2026, 9, 1).getTime());
    expect(october.to).toBe(new Date(2026, 10, 1).getTime());

    const year = parseSettings({ from: '2026', to: '2026' });
    expect(year.to).toBe(new Date(2027, 0, 1).getTime());

    const days = parseSettings({ from: '2026-08-01', to: '2026-08-14' });
    expect(days.to).toBe(new Date(2026, 7, 15).getTime());
  });

  it('reads sports, places, size presets and switches', () => {
    const settings = parseSettings({
      sport: 'Ride, Trail Run',
      'start-near': '47.5, 19.05',
      'end-near': '46.9,17.9',
      'end-radius': '300',
      size: 'landscape',
      map: false,
      title: '',
    });

    expect(settings.sports).toEqual(['ride', 'trail-run']);
    expect(settings.startNear).toEqual({ place: { lat: 47.5, lon: 19.05 }, radius: 1000 });
    expect(settings.endNear).toEqual({ place: { lat: 46.9, lon: 17.9 }, radius: 300 });
    expect([settings.width, settings.height]).toEqual([1920, 1080]);
    expect(settings.map).toBe(false);
    expect(settings.title).toBe('');
  });

  it.each([
    [{ duration: '90' }, 'duration: expects a number from 5 to 60, got "90"'],
    [{ duration: 'long' }, 'duration: expects a number from 5 to 60, got "long"'],
    [{ mode: 'all-at-once' }, 'mode: is not a setting'],
    [
      { group: 'year' },
      'group: expects auto or activity or day or week or month or all, got "year"',
    ],
    [{ 'group-pace': 'fast' }, 'group-pace: expects fit or real, got "fast"'],
    [{ camera: 'pan' }, 'camera: expects zoom or fixed or follow, got "pan"'],
    [{ from: 'October' }, 'from: expects YYYY-MM-DD, YYYY-MM or YYYY, got "October"'],
    [{ from: '2026-10', to: '2026-09' }, 'to: is before the period start'],
    [{ 'start-near': 'Budapest' }, 'start-near: expects latitude,longitude, got "Budapest"'],
    [{ 'end-radius': '500' }, 'end-radius: only applies with end-near'],
    [
      { size: '1081x1920' },
      'size: needs even numbers (a video format requirement), got "1081x1920"',
    ],
    [{ fps: '25' }, 'fps: expects 24 or 30 or 60, got "25"'],
    [{ speed: '2000' }, 'speed: is not a setting'],
    [{ activity: ' , ' }, 'activity: expects activity ids separated by commas'],
    [
      { 'metrics-fields': 'time,speed' },
      'metrics-fields: expects values from time, distance, pace, elevation, date, count, got "speed"',
    ],
    [
      { 'metrics-position': 'center' },
      'metrics-position: expects top-left or top-center or top-right or middle-left or middle-center or middle-right or bottom-left or bottom-center or bottom-right, got "center"',
    ],
    [{ 'metrics-size': '300' }, 'metrics-size: expects a number from 50 to 200, got "300"'],
  ])('rejects %j', (input, message) => {
    expect(errorOf(input)).toBe(message);
  });

  it('reads a list of activity ids', () => {
    expect(parseSettings({ activity: '12, 34,12,' }).activities).toEqual(['12', '34']);
  });

  it('reads the metrics card values in the order given', () => {
    const settings = parseSettings({ 'metrics-fields': 'Distance, time,distance', metrics: false });

    expect(settings.metricsFields).toEqual(['distance', 'time']);
    expect(settings.metrics).toBe(false);
  });

  it('takes a radius of up to 20 km around a place', () => {
    const near = (radius: string) =>
      parseSettings({ 'start-near': '47.5,19', 'start-radius': radius });

    expect(near('20000').startNear!.radius).toBe(20000);
    expect(() => near('20100')).toThrow('from 100 to 20000');
  });

  it('fills in a preset, under the settings given with it', () => {
    expect(parseSettings({ preset: 'all-at-once' })).toMatchObject({
      group: 'all',
      groupPace: 'real',
      duration: 30,
    });
    expect(parseSettings({ preset: 'multiday-trip' })).toMatchObject({
      group: 'day',
      share: 'distance',
      groupPace: 'fit',
      duration: 45,
    });
    expect(parseSettings({ preset: 'multiday-trip', duration: '20' }).duration).toBe(20);
    expect(parseSettings({ preset: 'highlight' })).toMatchObject({
      duration: 15,
      camera: 'follow',
    });
    expect(parseSettings({ preset: 'highlight', camera: 'fixed' }).camera).toBe('fixed');
    expect(errorOf({ preset: 'race' })).toBe(
      'preset: expects all-at-once or recap or multiday-trip or highlight, got "race"',
    );
  });

  it('reads the grouping, the time share and the paces', () => {
    expect(
      parseSettings({ group: 'all', share: 'distance', 'group-pace': 'real', pace: 'distance' }),
    ).toMatchObject({ group: 'all', share: 'distance', groupPace: 'real', pace: 'distance' });
  });
});

describe('SETTINGS', () => {
  it('names every setting once', () => {
    const names = SETTINGS.map((s) => s.name);

    expect(new Set(names).size).toBe(names.length);
  });
});
