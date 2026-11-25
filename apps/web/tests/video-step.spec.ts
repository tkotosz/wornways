import { expect, test } from '@playwright/test';
import { offlineMap } from './offline-map.ts';
import { pickSource } from './sources.ts';
import { openSection, openStep } from './steps.ts';

test('walks the Video step section by section, and opens any from its bar', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await page.goto('/');
  await pickSource(page, 'demo');
  await page.getByRole('button', { name: 'Continue' }).click(); // to Activities
  await page.getByRole('button', { name: 'Continue' }).click(); // to Video

  const heading = page.getByRole('heading', { level: 1 });
  const sections = page.getByRole('navigation', { name: 'Sections' }).getByRole('button');
  const current = () =>
    page
      .getByRole('navigation', { name: 'Sections' })
      .locator('[aria-current="step"]')
      .textContent();
  const headings = [
    ['Frame', 'Where will you post it?'],
    ['Playback', 'How should your routes play?'],
    ['Map', 'How should the map look?'],
    ['Overlay', 'What goes on the video?'],
    ['Ending', 'How should it end?'],
  ];
  await expect(sections).toHaveCount(5);

  // Continue goes through the sections in order, then to Export.
  for (const [i, [name, title]] of headings.entries()) {
    await expect(heading).toHaveText(title!);
    expect((await current())?.trim()).toBe(name);
    if (i < headings.length - 1) await page.getByRole('button', { name: 'Continue' }).click();
  }
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: 'Make video' })).toBeVisible();

  // Back comes into the last section and goes through them backwards, then to Activities.
  await page.getByRole('button', { name: '← Back' }).click();
  for (const [, title] of [...headings].reverse()) {
    await expect(heading).toHaveText(title!);
    await page.getByRole('button', { name: '← Back' }).click();
  }
  await expect(page.getByTestId('chosen-count')).toBeVisible();

  // The bar opens any section, and the section stays open after leaving the step.
  await openStep(page, 'Video');
  await openSection(page, 'Map');
  await expect(heading).toHaveText('How should the map look?');
  await openStep(page, 'Activities');
  await openStep(page, 'Video');
  await expect(heading).toHaveText('How should the map look?');
});
