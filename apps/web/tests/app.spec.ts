import { expect, test } from '@playwright/test';
import { offlineMap } from './offline-map.ts';
import { openDemo, openMenu, pickSource, switchSource } from './popups.ts';

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });

  test('starts with the sources, which stay until there is something to edit', async ({ page }) => {
    await page.goto('/');
    const sources = page.getByRole('dialog', { name: 'Choose a source' });
    await expect(sources).toBeVisible();
    await expect(sources.getByTestId('intro')).toBeVisible();
    // Nothing is behind it yet: no close, and neither Escape nor Back closes it.
    await expect(sources.getByRole('button', { name: 'Close' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(sources).toBeVisible();
    await page.goBack();
    await expect(sources).toBeVisible();

    // The menu stays in reach: About, and Back closes the page and then the menu.
    await openMenu(page);
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
      'href',
      '/privacy.html',
    );
    await menu.getByRole('button', { name: 'About' }).click();
    const about = page.getByRole('dialog', { name: 'About Wornways' });
    await expect(about).toContainText('open source under the MIT License');
    await page.goBack();
    await expect(about).toBeHidden();
    await expect(menu).toBeHidden();
    await expect(sources).toBeVisible();

    // Picking one leads on: the demo goes straight to its activities.
    await pickSource(page, 'demo');
    await expect(page.getByRole('dialog', { name: 'Choose your activities' })).toBeVisible();
    await expect(sources).toBeHidden();
  });
});

test('shows the version in the menu', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'Choose a source' })).toBeVisible();
  await openMenu(page);
  // A release tag, or branch · commit with -dirty for changes not committed yet.
  await expect(page.getByTestId('version')).toHaveText(
    /^(v\d+\.\d+\.\d+|(\S+ · )?[0-9a-f]{7,}(-dirty)?)$/,
  );
});

test('switches the source from the menu, which shows the one in use', async ({ page, context }) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await openDemo(page);
  await openMenu(page);
  await expect(page.getByRole('button', { name: /^Switch source/ })).toContainText('Demo');
  await page.keyboard.press('Escape');

  // The list marks the source in use, and closes back to editing.
  await switchSource(page);
  const sources = page.getByRole('dialog', { name: 'Choose a source' });
  await expect(sources.getByTestId('choose-demo')).toHaveAttribute('aria-current', 'true');
  await sources.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Activities: 25' })).toBeVisible();

  // Another source starts over: files, with none yet, ask for some first, with no way back.
  await switchSource(page);
  await pickSource(page, 'files');
  const files = page.getByRole('dialog', { name: 'Files on this device' });
  await expect(files.getByRole('button', { name: 'Choose activities' })).toBeDisabled();
  await expect(files.getByRole('button', { name: 'Close' })).toHaveCount(0);
});
