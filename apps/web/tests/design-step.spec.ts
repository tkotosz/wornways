import { expect, test } from '@playwright/test';
import { offlineMap } from './offline-map.ts';
import { pickSource } from './sources.ts';
import { expectSection, openSection, openStep } from './steps.ts';

test('opens any section of the Design step from its bar, and leaves the step from any', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await page.goto('/');
  await pickSource(page, 'demo');
  await page.getByRole('button', { name: 'Continue' }).click(); // to Activities
  await page.getByRole('button', { name: 'Continue' }).click(); // to Design

  const sections = page.getByRole('navigation', { name: 'Sections' }).getByRole('button');
  const order = ['Frame', 'Playback', 'Map', 'Overlay', 'Ending'] as const;
  await expect(sections).toHaveText([...order]);
  // No visible title above the section bar; the heading is there for screen readers.
  await expect(page.getByRole('heading', { level: 1, name: 'Design your video' })).toBeAttached();

  // The bar at the bottom names the steps before and after, and leaves the step from any
  // section.
  await expectSection(page, 'Frame');
  await openSection(page, 'Overlay');
  await page.getByRole('button', { name: 'Continue to Export →' }).click();
  await expect(page.getByRole('button', { name: 'Make video' })).toBeVisible();
  await page.getByRole('button', { name: '← Back to Design' }).click();
  await expectSection(page, 'Overlay');
  await page.getByRole('button', { name: '← Back to Activities' }).click();
  await expect(page.getByTestId('chosen-count')).toBeVisible();

  // The bar opens any section, and the section stays open after leaving the step.
  await openStep(page, 'Design');
  await openSection(page, 'Map');
  await expectSection(page, 'Map');
  await openStep(page, 'Activities');
  await openStep(page, 'Design');
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
    await page.getByRole('button', { name: 'Continue' }).click(); // to Design

    // The app's header and step bar make way for the editor's own top bar.
    await expect(page.getByRole('navigation', { name: 'Steps' })).toBeHidden();
    await expect(page.getByText('Step 3 of 4 · Design')).toBeVisible();

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
    await page.getByRole('button', { name: /^Metrics: / }).click();
    const values = page.getByRole('dialog', { name: 'Metrics' });
    await values.getByRole('button', { name: 'Pace' }).click();
    await values.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: /^Metrics: .*Pace$/ })).toBeVisible();

    // A switch turns in place, and a group switched off keeps only its switch.
    await page.getByRole('switch', { name: 'Show title' }).click();
    await expect(page.getByRole('button', { name: /^Text: / })).toHaveCount(0);
    expect(await pageScrolls()).toBe(false);

    // The top bar leaves the step either way.
    await page.getByRole('button', { name: 'Continue to Export →' }).click();
    await expect(page.getByRole('button', { name: 'Make video' })).toBeVisible();
    await page.getByRole('button', { name: '← Back to Design' }).click();
    await page.getByRole('button', { name: '← Back to Activities' }).click();
    await expect(page.getByTestId('chosen-count')).toBeVisible();
  });
});
