import { describe, expect, it } from 'vitest';
import { SETTINGS } from '@wornways/engine';
import {
  adjustSettings,
  fineTuned,
  playbackAdjustments,
  offered,
  presetChoices,
  presetOf,
  resetPlayback,
  settingLabel,
  startingValue,
  valueOf,
  withPreset,
  fromEarlierVersions,
  SECTIONS,
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
  it('puts every panel in one section, in the order things are decided', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(['frame', 'playback', 'map', 'overlay', 'ending']);
    expect(SECTIONS.find((s) => s.id === 'overlay')!.panels).toEqual([
      'title',
      'metrics',
      'elevation',
      'watermark',
    ]);
    expect(SECTIONS.find((s) => s.id === 'ending')!.panels).toEqual([
      'pause',
      'totals',
      'end-card',
    ]);
    const panels = SECTIONS.flatMap((s) => s.panels);
    expect(new Set(panels).size).toBe(panels.length);
  });

  it('keeps the end pause out of the playback a preset decides', () => {
    // Resetting playback leaves it, and one activity and several share it.
    const paused = { preset: 'recap', 'end-pause': '3' };
    expect(resetPlayback(paused, 'several')).toEqual({ 'end-pause': '3' });
    expect(adjustSettings(paused, 'several')['end-pause']).toBe('3');
    expect(adjustSettings(paused, 'one')['end-pause']).toBe('3');
    expect(playbackAdjustments(paused, 'several')['end-pause']).toBeUndefined();
  });

  it('offers the settings of a panel in order', () => {
    const names = (panel: Parameters<typeof offered>[0]) => offered(panel).map((s) => s.name);

    expect(names('timing')).toEqual(['group', 'share', 'group-pace', 'overlap', 'pace']);
    expect(names('pause')).toEqual(['end-pause']);
    expect(names('watermark')).toEqual(['watermark']);
    expect(names('end-card')).toEqual(['end-card']);
    expect(names('camera')).toEqual(['camera']);
    expect(names('map')).toEqual(['map']);
    expect(names('totals')).toEqual(['totals-card', 'totals-fields']);
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
    const trip = { preset: 'multiday-trip', duration: '20', camera: 'fixed', pace: 'distance' };

    expect(valueOf(trip, definition('group'), 'several')).toBe('day');
    expect(valueOf(trip, definition('duration'), 'several')).toBe('45');
    expect(valueOf(trip, definition('camera'), 'several')).toBe('follow');
    expect(valueOf(trip, definition('pace'), 'several')).toBe('distance');
    expect(adjustSettings(trip, 'several')).toEqual({ preset: 'multiday-trip', pace: 'distance' });
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
    // A reset goes back to the first preset, with nothing fine-tuned, and only for its size.
    const custom = withPreset(several, 'custom', 'several');
    expect(presetOf(resetPlayback(custom, 'several'), 'several')).toBe('all-at-once');
    expect(adjustSettings(resetPlayback(custom, 'several'), 'several')).toEqual({
      preset: 'all-at-once',
    });
    expect(adjustSettings(resetPlayback(custom, 'several'), 'one')).toEqual({
      duration: '15',
      camera: 'fixed',
    });
    expect(adjustSettings(resetPlayback(single, 'one'), 'one')).toEqual({ preset: 'highlight' });
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
      // Custom starts from all of Recap's values, its totals card too.
      'totals-card': true,
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

  it('starts the totals card on under Recap, and lets the switch decide', () => {
    const totals = definition('totals-card');
    const recap = { preset: 'recap' };
    expect(valueOf(recap, totals, 'several')).toBe(true);
    expect(startingValue(recap, 'several', 'totals-card')).toBe(true);
    expect(valueOf({ preset: 'all-at-once' }, totals, 'several')).toBe(false);
    // Switched off under Recap, it stays off, also when Recap turns Custom.
    const off = { ...recap, 'totals-card': false };
    expect(valueOf(off, totals, 'several')).toBe(false);
    expect(adjustSettings(off, 'several')).toEqual({ preset: 'recap', 'totals-card': false });
    const effective = playbackAdjustments(off, 'several');
    expect(fineTuned(off, { ...effective, duration: '20' }, 'several')).toMatchObject({
      preset: 'custom',
      'totals-card': false,
    });
    // Switched on for another preset.
    expect(adjustSettings({ 'totals-card': true }, 'several')).toEqual({
      preset: 'all-at-once',
      'totals-card': true,
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
