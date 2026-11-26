import { describe, expect, it } from 'vitest';
import { SETTINGS } from '@wornways/engine';
import {
  adjustSettings,
  fineTuned,
  playbackAdjustments,
  offered,
  presetChoices,
  presetOf,
  resetToPreset,
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

  it('passes on the widgets, over the replay and on the totals card', () => {
    expect(
      adjustSettings({ widgets: 'distance@20,88', 'totals-widgets': 'text@50,40' }, 'several'),
    ).toEqual({
      preset: 'all-at-once',
      widgets: 'distance@20,88',
      'totals-widgets': 'text@50,40',
    });
  });

  it('leaves out settings of earlier versions', () => {
    expect(
      adjustSettings(
        { title: '', 'title-position': 'bottom-right', 'metrics-size': '120' },
        'several',
      ),
    ).toEqual({ preset: 'all-at-once' });
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
    // Overlay's widgets are arranged on the still; the watermark stays a setting.
    expect(SECTIONS.find((s) => s.id === 'overlay')!.panels).toEqual(['units', 'watermark']);
    expect(SECTIONS.find((s) => s.id === 'ending')!.panels).toEqual([
      'pause',
      'totals',
      'units',
      'end-card',
    ]);
    // Each panel in one section, but the units, for the values over the replay and the card's.
    const panels = SECTIONS.flatMap((s) => s.panels).filter((panel) => panel !== 'units');
    expect(new Set(panels).size).toBe(panels.length);
  });

  it('keeps the end pause out of the playback a preset decides', () => {
    // Picking a preset, which starts the playback over, leaves it, and one activity and
    // several share it.
    const paused = { preset: 'recap', 'end-pause': '3' };
    expect(withPreset(paused, 'recap', 'several')).toEqual(paused);
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
    expect(names('totals')).toEqual(['totals-card']);
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

  it('picks a preset, which starts the playback over from it', () => {
    const tuned = { preset: 'custom', duration: '20', group: 'day', map: false };
    expect(withPreset(tuned, 'all-at-once', 'several')).toEqual({
      preset: 'all-at-once',
      map: false,
    });
  });

  it('starts the widgets again from the ones that suit another preset', () => {
    const arranged = { widgets: 'count@50,70', 'totals-widgets': 'distance@50,40', map: false };
    expect(withPreset(arranged, 'recap', 'several')).toEqual({ preset: 'recap', map: false });
    // The preset in use, picked again, and the playback kept as set keep them.
    const recap = { ...arranged, preset: 'recap' };
    expect(withPreset(recap, 'recap', 'several')).toEqual(recap);
    expect(withPreset(arranged, 'custom', 'several')).toEqual({ ...arranged, preset: 'custom' });
  });

  it('keeps custom timing and camera settings independent for each selection size', () => {
    // Custom starts from the preset's values, its layout too, which one and several share.
    const single = fineTuned({}, { ...playbackAdjustments({}, 'one'), camera: 'fixed' }, 'one');
    expect(adjustSettings(single, 'one')).toEqual({
      duration: '15',
      camera: 'fixed',
      layout: 'classic',
    });
    expect(adjustSettings(single, 'several')).toEqual({ preset: 'all-at-once', layout: 'classic' });
    const several = fineTuned(
      single,
      { ...playbackAdjustments(single, 'several'), duration: '22.5', camera: 'zoom' },
      'several',
    );
    expect(adjustSettings(several, 'one')).toEqual({
      duration: '15',
      camera: 'fixed',
      layout: 'classic',
    });
    expect(adjustSettings(several, 'several')).toMatchObject({ duration: '22.5', camera: 'zoom' });
    // A preset picked starts that size's playback over, with nothing fine-tuned.
    const custom = withPreset(several, 'custom', 'several');
    const picked = withPreset(custom, 'all-at-once', 'several');
    expect(presetOf(picked, 'several')).toBe('all-at-once');
    expect(adjustSettings(picked, 'several')).toEqual({ preset: 'all-at-once' });
    expect(adjustSettings(picked, 'one')).toEqual({ duration: '15', camera: 'fixed' });
    expect(adjustSettings(withPreset(single, 'highlight', 'one'), 'one')).toEqual({
      preset: 'highlight',
    });
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
      // Custom starts from all of Recap's values, its totals card and layout too.
      'totals-card': true,
      layout: 'classic',
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

  it('resets to a preset: its playback, widgets, layout and totals card, the rest kept', () => {
    const tuned = {
      preset: 'recap',
      duration: '20',
      widgets: 'distance@50,50',
      'totals-widgets': 'count@50,40',
      layout: 'hero',
      'totals-card': false,
      units: 'imperial',
      size: '1080x1080',
      'end-pause': '2',
    };
    expect(resetToPreset(tuned, 'recap', 'several')).toEqual({
      preset: 'recap',
      units: 'imperial',
      size: '1080x1080',
      'end-pause': '2',
    });
    // From Custom, to the preset picked.
    expect(resetToPreset({ ...tuned, preset: 'custom' }, 'all-at-once', 'several')).toEqual({
      preset: 'all-at-once',
      units: 'imperial',
      size: '1080x1080',
      'end-pause': '2',
    });
  });

  it('starts afresh from settings saved by an earlier version, and keeps its own', () => {
    expect(fromEarlierVersions({ preset: 'custom', camera: 'fixed' })).toEqual({
      'saved-with': 'label-positions',
    });
    expect(fromEarlierVersions({ camera: 'fixed', 'saved-with': 'separate-playback' })).toEqual({
      'saved-with': 'label-positions',
    });
    const now = { preset: 'custom', camera: 'fixed', 'saved-with': 'label-positions' };
    expect(fromEarlierVersions(now)).toEqual(now);
  });
});
