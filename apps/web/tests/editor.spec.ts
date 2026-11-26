import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { offlineMap } from './offline-map.ts';
import {
  activitiesPopup,
  chooseStyle,
  expectSection,
  openActivities,
  openDemo,
  openSection,
  pickPeriod,
  pickSource,
  presetPopup,
  render,
  renderPopup,
  useActivities,
} from './popups.ts';

/** Ticks one activity alone in the activities popup. */
async function only(page: Page, name: string) {
  const all = activitiesPopup(page).getByRole('checkbox', { name: 'Select all shown' });
  await all.check();
  await all.uncheck();
  await activitiesPopup(page).getByRole('checkbox', { name }).check();
}

/** Ticks every activity in the activities popup. */
const all = (page: Page) =>
  activitiesPopup(page).getByRole('checkbox', { name: 'Select all shown' }).check();

test('asks for the preset for a new kind of selection, and keeps it for more or fewer', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await page.goto('/');
  await pickSource(page, 'demo');
  await pickPeriod(page);
  await useActivities(page);

  // The first selection: the presets for several activities, none picked, and no way past
  // them but a choice.
  const chooser = presetPopup(page);
  await expect(chooser.getByRole('button', { name: /^(All at once|Recap|Multiday)/ })).toHaveText([
    /^All at once/,
    /^Recap/,
    /^Multiday trip/,
  ]);
  await expect(chooser.getByRole('button', { name: 'Close' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(chooser).toBeVisible();
  await chooseStyle(page, 'Recap');
  await expect(chooser).toBeHidden();
  await expect(page.getByRole('button', { name: 'Preset: Recap' })).toBeVisible();
  await openSection(page, 'Playback');
  await expect(page.getByTestId('replay-summary')).toContainText('Recap');

  // Fewer activities, still several: back to editing, the preset kept.
  await openActivities(page);
  await activitiesPopup(page).getByRole('checkbox', { name: 'Sa Calobra' }).uncheck();
  await useActivities(page);
  await expect(chooser).toBeHidden();
  await expect(page.getByRole('button', { name: 'Activities: 24' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preset: Recap' })).toBeVisible();

  // One activity has a single preset, Highlight, which it gets without asking.
  await openActivities(page);
  await only(page, 'Sa Calobra');
  await useActivities(page);
  await expect(chooser).toBeHidden();
  await expect(page.getByRole('button', { name: 'Preset: Highlight' })).toBeVisible();

  // Several again: asked again. Playback set by hand can be kept.
  await openActivities(page);
  await all(page);
  await useActivities(page);
  await chooseStyle(page, 'Recap');
  await page.getByRole('button', { name: /Fine-tune playback/ }).click();
  await page.getByTestId('group-timing').getByRole('button', { name: 'Day', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preset: Custom' })).toBeVisible();
  await openActivities(page);
  await only(page, 'Sa Calobra');
  await useActivities(page);
  await openActivities(page);
  await all(page);
  await useActivities(page);
  await chooseStyle(page, 'Keep my own playback');
  await expect(page.getByTestId('replay-summary')).toContainText('Custom playback');

  // From the top bar the preset changes, the one in use marked, and closes without a choice.
  await page.getByRole('button', { name: 'Preset: Custom' }).click();
  await expect(chooser.getByRole('button', { name: /^Keep my own/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await chooser.getByRole('button', { name: 'Close' }).click();
  await expect(chooser).toBeHidden();
});

test('sets the widgets with the preset, and keeps them with the playback kept', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await openDemo(page, 'Recap');
  await openSection(page, 'Overlay');
  const onPicture = page.locator('[data-widget]');
  await expect(page.getByTestId('widget-0')).toBeVisible();

  // A text added by hand…
  await page.getByRole('button', { name: 'Add a text' }).click();
  await page.keyboard.type('Mallorca');
  await page.keyboard.press('Enter');
  await expect(onPicture.filter({ hasText: 'Mallorca' })).toHaveCount(1);

  // …stays when the preset in use is picked again…
  await page.getByRole('button', { name: 'Preset: Recap' }).click();
  await chooseStyle(page, 'Recap');
  await expect(onPicture.filter({ hasText: 'Mallorca' })).toHaveCount(1);

  // …and goes with another preset, whose video starts with its own widgets: a race's count.
  await page.getByRole('button', { name: 'Preset: Recap' }).click();
  await chooseStyle(page, 'All at once');
  await expect(onPicture.filter({ hasText: 'Mallorca' })).toHaveCount(0);
  await expect(onPicture.filter({ hasText: /all\s*finished/ })).toHaveCount(1);

  // Playback set by hand keeps them.
  await page.getByRole('button', { name: 'Add a text' }).click();
  await page.keyboard.type('Mallorca');
  await page.keyboard.press('Enter');
  await openSection(page, 'Playback');
  await page.getByRole('button', { name: /Fine-tune playback/ }).click();
  await page.getByTestId('group-timing').getByRole('button', { name: 'Day', exact: true }).click();
  await page.getByRole('button', { name: 'Preset: Custom' }).click();
  await chooseStyle(page, 'Keep my own playback');
  await openSection(page, 'Overlay');
  await expect(onPicture.filter({ hasText: 'Mallorca' })).toHaveCount(1);
});

test('opens any section from its bar, and keeps it while popups open and close', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await openDemo(page);

  const sections = page.getByRole('navigation', { name: 'Sections' }).getByRole('button');
  const order = ['Frame', 'Playback', 'Map', 'Overlay', 'Ending'] as const;
  await expect(sections).toHaveText([...order]);
  // No visible title above the section bar; the heading is there for screen readers.
  await expect(page.getByRole('heading', { level: 1, name: 'Design your video' })).toBeAttached();
  await expectSection(page, 'Frame');
  await openSection(page, 'Map');

  // The activities, closed without a change: the editor as it was.
  await openActivities(page);
  await activitiesPopup(page).getByRole('checkbox', { name: 'Sa Calobra' }).uncheck();
  await activitiesPopup(page).getByRole('button', { name: 'Close' }).click();
  await expect(activitiesPopup(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Activities: 25' })).toBeVisible();
  await expectSection(page, 'Map');

  // Render, closed: back to editing on the same section.
  await render(page);
  await expect(renderPopup(page)).toBeVisible();
  await renderPopup(page).getByRole('button', { name: 'Close' }).click();
  await expect(renderPopup(page)).toBeHidden();
  await expectSection(page, 'Map');
});

test.describe('the editor on a phone', () => {
  test.use({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });

  test('is a screen of its own: the top bar, the preview, a strip of settings and the sections', async ({
    page,
    context,
  }) => {
    page.setDefaultTimeout(15_000);
    await offlineMap(context);
    await openDemo(page);

    const preview = page.getByTestId('preview').getByRole('img');
    const sections = page.getByRole('navigation', { name: 'Sections' });
    await expect(preview).toBeVisible();
    const shape = page.getByRole('button', { name: 'Shape: Story 9:16' });
    const menu = page.getByRole('button', { name: 'Menu' });
    const renderButton = page.getByRole('button', { name: 'Render', exact: true });
    for (const item of [menu, renderButton, preview, sections, shape])
      await expect(item).toBeInViewport({ ratio: 1 });
    // The top bar's icons at the left, Render at the right.
    expect((await menu.boundingBox())!.x).toBeLessThan(20);
    const renderBox = (await renderButton.boundingBox())!;
    expect(renderBox.x + renderBox.width).toBeGreaterThan(390 - 20);
    // The preview above the settings, the sections along the bottom, nothing to scroll.
    const previewBox = (await preview.boundingBox())!;
    const sectionsBox = (await sections.boundingBox())!;
    expect(previewBox.height).toBeGreaterThan(780 * 0.6);
    // The settings are one strip of chips, side by side.
    const fps = page.getByRole('button', { name: 'Frame rate: 30 fps' });
    expect((await fps.boundingBox())!.y).toBeCloseTo((await shape.boundingBox())!.y, 0);
    expect(sectionsBox.y + sectionsBox.height).toBeCloseTo(780, 0);
    const pageScrolls = () =>
      page.locator('html').evaluate((html) => html.scrollHeight > html.clientHeight);
    expect(await pageScrolls()).toBe(false);

    // A chip opens its setting in a sheet, where a change shows on the chip at once.
    await shape.click();
    const sheet = page.getByRole('dialog', { name: 'Shape' });
    await sheet.getByRole('button', { name: 'Square 1:1' }).click();
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: 'Shape: Square 1:1' })).toBeVisible();

    // A choice alone shows its explanation; the lists of values pick in order.
    await openSection(page, 'Playback');
    await page.getByRole('button', { name: /^Grouping: / }).click();
    const grouping = page.getByRole('dialog', { name: 'Grouping' });
    await expect(grouping).toContainText('Which activities play together');
    await grouping.getByRole('button', { name: 'Day', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Grouping: Day' })).toBeVisible();
    await openSection(page, 'Overlay');
    await expectSection(page, 'Overlay');
    // Overlay has its strip too: adding widgets, the chart and the watermark.
    await expect(page.getByRole('button', { name: 'Add a widget' })).toHaveCount(0);
    const onPicture = page.locator('[data-widget]');
    await expect(page.getByTestId('widget-0')).toBeVisible();
    const count = await onPicture.count();
    const done = page.getByRole('button', { name: '✓ Done' });
    // A text is written over the whole screen, and a tap outside the text finishes, there only.
    await page.getByRole('button', { name: 'Add a text' }).click();
    const writing = page.getByRole('dialog', { name: 'Text' });
    await expect(writing.getByRole('textbox', { name: 'Text' })).toBeFocused();
    await page.keyboard.type('Mallorca');
    await writing.click({ position: { x: 20, y: 760 } });
    await expect(writing).toBeHidden();
    await expect(onPicture).toHaveCount(count + 1);
    await expect(onPicture.last()).toContainText('Mallorca');
    await expectSection(page, 'Overlay');
    // The new text is picked: the strip is its own, until Done.
    await expect(page.getByRole('button', { name: 'Edit the text' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Label / })).toHaveCount(0);
    await done.click();
    // A text left empty goes away.
    await page.getByRole('button', { name: 'Add a text' }).click();
    await page.keyboard.press('Enter');
    await expect(writing).toBeHidden();
    await expect(onPicture).toHaveCount(count + 1);
    // Stats come from a sheet of them alone; a new one has its words under it.
    await page.getByRole('button', { name: 'Add a stat' }).click();
    const values = page.getByRole('dialog', { name: 'Stats' });
    await expect(values.getByRole('button', { name: /Elevation chart$/ })).toHaveCount(0);
    await values.getByRole('button', { name: / Moving days$/ }).click();
    await expect(values).toBeHidden();
    await expect(onPicture).toHaveCount(count + 2);
    const days = onPicture.last();
    await expect(days.locator('.words')).toHaveText(/moving days?/);
    // Its label position, from its chip: after it, then above it.
    await page.getByRole('button', { name: 'Label position: Under' }).click();
    const position = page.getByRole('dialog', { name: 'Moving days: label position' });
    await expect(position.getByRole('textbox')).toHaveCount(0);
    await position.getByRole('radio', { name: /^After/ }).click();
    await expect(days.locator('.value')).toHaveText(/^\d+ moving days?$/);
    await position.getByRole('radio', { name: /^Above/ }).click();
    await expect(days.locator('.words')).toHaveText(/moving days?/);
    await expect(days.locator('.words + .value')).toHaveText(/^\d+$/);
    await position.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: 'Label position: Above' })).toBeVisible();
    // Its label text, from a chip of its own: words of its own, then back to the usual.
    await page.getByRole('button', { name: /^Label text: moving days?$/ }).click();
    const text = page.getByRole('dialog', { name: 'Moving days: label text' });
    const words = text.getByRole('textbox', { name: 'Label text' });
    await expect(words).toHaveValue(/moving days?/);
    await words.fill('days riding');
    await expect(days.locator('.words')).toHaveText('days riding');
    await text.getByRole('button', { name: /^Use the usual words/ }).click();
    await expect(days.locator('.words')).toHaveText(/moving days?/);
    await words.fill('');
    await text.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: 'Label text: None' })).toBeVisible();
    // Remove takes it off; there is no Center, as dragging snaps to the middle.
    await expect(page.getByRole('button', { name: 'Center it across' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Remove from the picture' }).click();
    await expect(onPicture).toHaveCount(count + 1);
    // The chart and the watermark turn on and off.
    const chart = page.getByRole('switch', { name: 'Elevation chart' });
    await expect(chart).not.toBeChecked();
    await chart.click();
    await expect(chart).toBeChecked();
    await expect(onPicture).toHaveCount(count + 2);
    await chart.click();
    await expect(onPicture).toHaveCount(count + 1);
    const mark = page.getByRole('switch', { name: 'Show watermark' });
    await expect(mark).toBeChecked();
    await mark.click();
    await expect(mark).not.toBeChecked();
    expect(await pageScrolls()).toBe(false);

    // A popup takes the whole screen; the back gesture closes it, back to the same section.
    await openActivities(page);
    const popupBox = (await activitiesPopup(page).boundingBox())!;
    expect(popupBox.width).toBeCloseTo(390, 0);
    expect(popupBox.height).toBeCloseTo(780, 0);
    await page.goBack();
    await expect(activitiesPopup(page)).toBeHidden();
    await expectSection(page, 'Overlay');
  });
});
