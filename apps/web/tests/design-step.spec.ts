import { expect, test } from '@playwright/test';
import { offlineMap } from './offline-map.ts';
import { pickSource } from './sources.ts';
import { chooseStyle, expectSection, openSection, openStep, pickPeriod } from './steps.ts';

test('asks how the video plays each time it comes after Activities', async ({ page, context }) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await page.goto('/');
  await pickSource(page, 'demo');
  await page.getByRole('button', { name: 'Continue' }).click(); // to Activities
  await pickPeriod(page);
  await page.getByRole('button', { name: 'Continue' }).click(); // to Design

  // The styles for several activities, none picked; the editor and Export wait for one.
  const chooser = page.getByRole('region', { name: 'How should it play?' });
  await expect(chooser.getByRole('button')).toHaveText([
    /^All at once/,
    /^Recap/,
    /^Multiday trip/,
  ]);
  await expect(page.getByRole('navigation', { name: 'Sections' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue to Export' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeDisabled();
  await chooseStyle(page, 'Recap');
  await openSection(page, 'Playback');
  await expect(page.getByRole('radio', { name: /^Recap/ })).toHaveAttribute('aria-checked', 'true');

  // Back from Export it does not ask; on from Activities it asks again.
  await page.getByRole('button', { name: 'Continue to Export' }).click();
  await page.getByRole('button', { name: 'Back to Design' }).click();
  await expectSection(page, 'Playback');
  await page.getByRole('button', { name: 'Back to Activities' }).click();
  await page.getByRole('button', { name: 'Continue to Design' }).click();
  await expect(chooser).toBeVisible();

  // Playback set by hand can be kept.
  await chooseStyle(page, 'Recap');
  await page.getByRole('button', { name: /Fine-tune playback/ }).click();
  await page.getByTestId('group-timing').getByRole('button', { name: 'Day', exact: true }).click();
  await page.getByRole('button', { name: 'Back to Activities' }).click();
  await page.getByRole('button', { name: 'Continue to Design' }).click();
  await chooseStyle(page, 'Keep my own playback');
  await expect(page.getByTestId('replay-summary')).toContainText('Custom playback');
});

test('opens any section of the Design step from its bar, and leaves the step from any', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await page.goto('/');
  await pickSource(page, 'demo');
  await page.getByRole('button', { name: 'Continue' }).click(); // to Activities
  await pickPeriod(page);
  await page.getByRole('button', { name: 'Continue' }).click(); // to Design
  await chooseStyle(page);

  const sections = page.getByRole('navigation', { name: 'Sections' }).getByRole('button');
  const order = ['Frame', 'Playback', 'Map', 'Overlay', 'Ending'] as const;
  await expect(sections).toHaveText([...order]);
  // No visible title above the section bar; the heading is there for screen readers.
  await expect(page.getByRole('heading', { level: 1, name: 'Design your video' })).toBeAttached();

  // The bar at the bottom names the steps before and after, and leaves the step from any
  // section.
  await expectSection(page, 'Frame');
  await openSection(page, 'Overlay');
  await page.getByRole('button', { name: 'Continue to Export' }).click();
  await expect(page.getByRole('button', { name: 'Make video' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Design' }).click();
  await expectSection(page, 'Overlay');
  await page.getByRole('button', { name: 'Back to Activities' }).click();
  await expect(page.getByTestId('chosen-count')).toBeVisible();

  // The bar opens any section, and the section stays open after leaving the step.
  await openStep(page, 'Design');
  await chooseStyle(page);
  await openSection(page, 'Map');
  await expectSection(page, 'Map');
  await openStep(page, 'Activities');
  await openStep(page, 'Design');
  await chooseStyle(page);
  await expectSection(page, 'Map');
});

test.describe('the Design step on a phone', () => {
  test.use({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });

  test('is an editor screen: the preview, a list of settings and the sections below', async ({
    page,
    context,
  }) => {
    page.setDefaultTimeout(15_000);
    await offlineMap(context);
    await page.goto('/');
    await pickSource(page, 'demo');
    await page.getByRole('button', { name: 'Continue' }).click(); // to Activities
    await pickPeriod(page);
    await page.getByRole('button', { name: 'Continue' }).click(); // to Design
    await chooseStyle(page);

    // The app's header and step bar make way for the editor's own top bar.
    await expect(page.getByRole('navigation', { name: 'Steps' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Step 3 of 4: Design' })).toBeVisible();

    const preview = page.getByTestId('preview').getByRole('img');
    const sections = page.getByRole('navigation', { name: 'Sections' });
    await expect(preview).toBeVisible();
    const shape = page.getByRole('button', { name: 'Shape: Story 9:16' });
    for (const item of [preview, sections, shape]) await expect(item).toBeInViewport({ ratio: 1 });
    // The preview above the settings, the sections along the bottom, nothing to scroll.
    const previewBox = (await preview.boundingBox())!;
    const sectionsBox = (await sections.boundingBox())!;
    expect(previewBox.height).toBeGreaterThan(780 * 0.45);
    expect(sectionsBox.y + sectionsBox.height).toBeCloseTo(780, 0);
    const pageScrolls = () =>
      page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
    expect(await pageScrolls()).toBe(false);

    // The settings are a list with their values; a row opens its setting in a sheet, where
    // a change shows in the list at once.
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
    // Overlay lists the widgets; one is added from the palette, and a switch turns in place.
    await page.getByRole('button', { name: 'Add a widget' }).click();
    await page
      .getByRole('dialog', { name: 'Add a widget' })
      .getByRole('button', { name: / Pace$/ })
      .click();
    await expect(page.getByRole('button', { name: /^Pace: / })).toBeVisible();
    const watermark = page.getByRole('switch', { name: 'Show watermark' });
    await expect(watermark).toBeChecked();
    await watermark.click();
    await expect(watermark).not.toBeChecked();
    expect(await pageScrolls()).toBe(false);

    // The top bar leaves the step either way.
    await page.getByRole('button', { name: 'Continue to Export' }).click();
    await expect(page.getByRole('button', { name: 'Make video' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to Design' }).click();
    await page.getByRole('button', { name: 'Back to Activities' }).click();
    await expect(page.getByTestId('chosen-count')).toBeVisible();
  });
});
