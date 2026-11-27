import { describe, expect, it } from 'vitest';
import { afterSource, asksPreset } from '../src/flow.ts';

describe('after a source is picked', () => {
  it('connects Strava and Ride with GPS first, unless they are connected', () => {
    expect(afterSource('strava', { connected: false, files: 3 })).toBe('connect');
    expect(afterSource('rwgps', { connected: false, files: 0 })).toBe('connect');
    expect(afterSource('strava', { connected: true, files: 0 })).toBe('activities');
    expect(afterSource('rwgps', { connected: true, files: 0 })).toBe('activities');
  });

  it('asks for files only while the files source has none', () => {
    expect(afterSource('files', { connected: false, files: 0 })).toBe('store');
    expect(afterSource('files', { connected: false, files: 2 })).toBe('activities');
  });

  it('goes straight to the activities of the demo', () => {
    expect(afterSource('demo', { connected: false, files: 0 })).toBe('activities');
  });
});

describe('the preset after choosing activities', () => {
  it('is asked for the first selection of several, and on a change from one to several', () => {
    expect(asksPreset(null, 'several')).toBe(true);
    expect(asksPreset('one', 'several')).toBe(true);
  });

  it('is kept while the selection stays several, however many', () => {
    expect(asksPreset('several', 'several')).toBe(false);
  });

  it('is not asked for one activity, which has a single preset', () => {
    expect(asksPreset(null, 'one')).toBe(false);
    expect(asksPreset('several', 'one')).toBe(false);
  });
});
