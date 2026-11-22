import { expect, test } from '@playwright/test';

test('names its icons in the app manifest', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = new URL(href!, page.url());
  const { icons, display } = await (await request.get(manifest.href)).json();
  expect(display).toBe('standalone');
  const sizes = icons.map((icon: { sizes: string }) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const icon of icons) {
    const response = await request.get(new URL(icon.src, manifest).href);
    expect(response.ok(), icon.src).toBe(true);
  }
});

test('starts without a network after the first visit', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate('navigator.serviceWorker.ready');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Steps' })).toBeVisible();
  await expect(page.getByTestId('sources')).toBeVisible();
  await context.setOffline(false);
});

test('installs from its own button when the browser offers it', async ({ page }) => {
  await page.goto('/');
  const install = page.getByRole('button', { name: 'Install app' });
  await expect(page.getByRole('navigation', { name: 'Steps' })).toBeVisible();
  await expect(install).toBeHidden();

  // The offer Chrome and Edge send once the app can be installed.
  await page.evaluate(`{
    const offer = new Event('beforeinstallprompt', { cancelable: true });
    offer.prompt = async () => {
      window.installAsked = true;
      return { outcome: 'accepted' };
    };
    dispatchEvent(offer);
  }`);
  await install.click();
  expect(await page.evaluate('window.installAsked')).toBe(true);
  await expect(install).toBeHidden();
});
