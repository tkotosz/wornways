import { describe, expect, it } from 'vitest';
import { SETTINGS, parseSettings } from '@wornways/engine';
import {
  adjustSettings,
  fineTuned,
  playbackAdjustments,
  offered,
  presetChoices,
  presetOf,
  resetPlayback,
  settingLabel,
  valueOf,
  withPreset,
  fromEarlierVersions,
} from '../src/adjust.ts';

const definition = (name: string) => SETTINGS.find((s) => s.name === name)!;

describe('adjustSettings', () => {
  it('passes on what was set', () => {
    expect(
      adjustSettings({ preset: 'custom', duration: '20', camera: 'fixed', map: false }, 'several'),
    ).toEqual({
      duration: '20',
      camera: 'fixed',
      map: false,
    });
  });

  it('passes on the title and the values from the Text step', () => {
    expect(
      adjustSettings(
        { title: '', 'title-position': 'bottom-right', 'metrics-size': '120' },
        'several',
      ),
    ).toEqual({
      preset: 'all-at-once',
      title: '',
      'title-position': 'bottom-right',
      'metrics-size': '120',
    });
  });

  it('gives no title when the title is switched off, and keeps its text for later', () => {
    expect(adjustSettings({ title: 'Spring', 'show-title': false }, 'several')).toMatchObject({
      title: '',
    });
    expect(adjustSettings({ title: 'Spring' }, 'several')).toMatchObject({ title: 'Spring' });
  });

  it('leaves out settings chosen elsewhere', () => {
    expect(adjustSettings({ sport: 'ride', radius: '500' }, 'several')).toEqual({
      preset: 'all-at-once',
    });
  });
});

describe('the settings offered', () => {
  it('offers the settings of a panel in order', () => {
    const names = (panel: Parameters<typeof offered>[0]) => offered(panel).map((s) => s.name);

    expect(names('timing')).toEqual(['group', 'share', 'group-pace', 'overlap', 'pace']);
    expect(names('camera')).toEqual(['camera']);
    expect(names('map')).toEqual(['map']);
  });

  it('keeps the metrics panel to the metrics', () => {
    expect(offered('metrics').map((s) => s.name)).toEqual([
      'metrics',
      'metrics-fields',
      'metrics-position',
      'metrics-size',
    ]);
  });

  it('calls the video length its duration', () => {
    expect(settingLabel(definition('duration'))).toBe('Video duration');
  });

  it('shows each setting with its default until it is set', () => {
    expect(valueOf({}, definition('duration'), 'several')).toBe('30');
    expect(valueOf({ preset: 'custom', duration: '15' }, definition('duration'), 'several')).toBe(
      '15',
    );
  });

  it('leaves out a mode remembered from an earlier version of the app', () => {
    expect(adjustSettings({ mode: 'all-at-once', camera: 'fixed' }, 'several')).toEqual({
      preset: 'all-at-once',
      camera: 'fixed',
    });
  });
});

describe('presets', () => {
  it('starts with the first preset, All at once, and passes it on with the settings', () => {
    expect(presetOf({}, 'several')).toBe('all-at-once');
    expect(adjustSettings({}, 'several')).toEqual({ preset: 'all-at-once' });
    expect(adjustSettings({ preset: 'all-at-once', camera: 'fixed' }, 'several')).toEqual({
      preset: 'all-at-once',
      camera: 'fixed',
    });
    // Custom is no preset: the settings say it all.
    expect(adjustSettings({ preset: 'custom', group: 'week' }, 'several')).toEqual({
      group: 'week',
    });
  });

  it('offers Highlight for one activity, the others for several', () => {
    expect(presetChoices('one')).toEqual(['highlight']);
    expect(presetChoices('several')).toEqual(['all-at-once', 'recap', 'multiday-trip']);
    expect(presetOf({}, 'one')).toBe('highlight');
    // Each remembers its own: Recap for several does not change the one for one activity.
    const both = { preset: 'all-at-once', 'preset-one': 'custom' };
    expect(presetOf(both, 'several')).toBe('all-at-once');
    expect(presetOf(both, 'one')).toBe('custom');
    expect(adjustSettings({}, 'one')).toEqual({ preset: 'highlight' });
  });

  it('takes the settings a preset sets from the preset, even when set under Custom', () => {
    const trip = { preset: 'multiday-trip', duration: '20', camera: 'fixed' };

    expect(valueOf(trip, definition('group'), 'several')).toBe('day');
    expect(valueOf(trip, definition('duration'), 'several')).toBe('45');
    expect(valueOf(trip, definition('camera'), 'several')).toBe('fixed');
    expect(adjustSettings(trip, 'several')).toEqual({ preset: 'multiday-trip', camera: 'fixed' });
  });

  it('picks a preset and keeps existing overrides', () => {
    expect(withPreset({ preset: 'custom', duration: '20' }, 'all-at-once', 'several')).toEqual({
      preset: 'all-at-once',
      duration: '20',
    });
  });

  it('keeps custom timing and camera settings independent for each selection size', () => {
    const single = fineTuned({}, { ...playbackAdjustments({}, 'one'), camera: 'fixed' }, 'one');
    expect(adjustSettings(single, 'one')).toEqual({ duration: '15', camera: 'fixed' });
    expect(adjustSettings(single, 'several')).toEqual({ preset: 'all-at-once' });
    const several = fineTuned(
      single,
      { ...playbackAdjustments(single, 'several'), duration: '22.5', camera: 'zoom' },
      'several',
    );
    expect(adjustSettings(several, 'one')).toEqual({ duration: '15', camera: 'fixed' });
    expect(adjustSettings(several, 'several')).toMatchObject({ duration: '22.5', camera: 'zoom' });
    for (const count of ['one', 'several'] as const) {
      expect(parseSettings(adjustSettings(resetPlayback(several, count), count))).toEqual(
        parseSettings({}),
      );
    }
  });

  it('turns Custom when Fine-tune changes a value the preset sets, and only then', () => {
    const recap = { preset: 'recap', duration: '20' };
    const effective = playbackAdjustments(recap, 'several');

    expect(fineTuned(recap, { ...effective, group: 'week' }, 'several')).toEqual({
      preset: 'custom',
      group: 'week',
      share: 'even',
      'group-pace': 'fit',
      duration: '30',
    });
    expect(fineTuned(recap, { ...effective, camera: 'fixed' }, 'several')).toEqual({
      ...recap,
      camera: 'fixed',
    });
    expect(fineTuned(recap, effective, 'several')).toEqual(recap);
    expect(fineTuned(recap, { ...effective, duration: '20' }, 'several')).toMatchObject({
      preset: 'custom',
      duration: '20',
    });
  });

  it('starts settings saved by earlier versions again from the first preset', () => {
    expect(
      fromEarlierVersions({ preset: 'custom', 'preset-one': 'custom', camera: 'fixed' }),
    ).toEqual({
      camera: 'fixed',
      'one-camera': 'fixed',
      'saved-with': 'separate-playback',
    });
    const now = { preset: 'custom', camera: 'fixed', 'saved-with': 'five-steps' };
    expect(fromEarlierVersions(now)).toEqual({
      ...now,
      'one-camera': 'fixed',
      'saved-with': 'separate-playback',
    });
  });
});
