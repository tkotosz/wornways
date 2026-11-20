import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { listZip, readZipEntry } from '../../../packages/engine/src/import/zip.ts';

const fixtures = new URL('../../../packages/engine/tests/import/fixtures/', import.meta.url);
const endpoint = /\/api\/garmin(?:\?|$)/;
const key = 'test-personal-api-key';
const token = 'test-garmin-bearer-token';
const rideId = '12345678';
const rideName = 'Garmin test ride';
const olderYear = new Date().getFullYear() - 1;

test.use({ serviceWorkers: 'block' });

/** Reuse the generated Garmin export's inner archive of original activity files. */
async function zippedActivity(): Promise<Buffer> {
  const name = 'garmin-export.zip';
  const bytes = await readFile(new URL(name, fixtures));
  const archive = {
    name,
    size: bytes.length,
    read: async (offset: number, size: number) => bytes.subarray(offset, offset + size),
  };
  const original = (await listZip(archive)).find((entry) => entry.path.endsWith('Part1.zip'));
  if (!original) throw new Error('The Garmin fixture has no original activity archive.');
  return Buffer.from(await readZipEntry(archive, original));
}

async function fakeGarmin(page: Page) {
  const downloads: string[] = [];
  const exchanges: string[] = [];
  const offsets: string[] = [];
  const rideDate = `${olderYear}-03-15`;
  const original = await zippedActivity();
  let tiles = 0;

  await page.context().route(endpoint, async (route) => {
    const request = route.request();
    const { searchParams } = new URL(request.url());
    if (request.method() === 'POST') {
      const submitted = (request.postDataJSON() as { key: string }).key;
      exchanges.push(submitted);
      return submitted === key
        ? route.fulfill({ json: { token, expiresAt: Date.now() + 3_600_000 } })
        : route.fulfill({ status: 401, json: {} });
    }
    if (!searchParams.size) return route.fulfill({ json: { available: true } });
    if ((await request.headerValue('authorization')) !== `Bearer ${token}`)
      return route.fulfill({ status: 401, json: {} });

    const activity = searchParams.get('activity');
    if (activity) {
      downloads.push(activity);
      return activity === rideId
        ? route.fulfill({ contentType: 'application/x-zip-compressed', body: original })
        : route.fulfill({ status: 404, json: {} });
    }

    const start = searchParams.get('start') ?? '';
    const from = searchParams.get('startDate') ?? '';
    const to = searchParams.get('endDate') ?? '';
    offsets.push(start);
    if (!(from <= rideDate && rideDate <= to)) return route.fulfill({ json: [] });
    if (start === '0') {
      // Garmin searches activity-local dates. This page is on the padded edge of the
      // search and outside Wornways' exact period in GMT.
      const json = Array.from({ length: 99 }, (_, index) => ({
        activityId: index + 1,
        activityName: 'Activity outside the selected period',
        activityType: { typeKey: 'cycling' },
        startTimeGMT: `${olderYear - 1}-12-31 00:00:00`,
        distance: 4000,
      }));
      return route.fulfill({ json });
    }
    return route.fulfill({
      json:
        start === '99'
          ? [
              {
                activityId: Number(rideId),
                activityName: rideName,
                activityType: { typeKey: 'road_biking' },
                startTimeGMT: `${rideDate} 10:30:00`,
                distance: 10_400,
                startLatitude: 47.496,
                startLongitude: 19.04,
                endLatitude: 47.5,
                endLongitude: 19.05,
              },
              {
                activityId: 12345679,
                activityName: 'Garmin indoor ride',
                activityType: { typeKey: 'indoor_cycling' },
                startTimeGMT: `${rideDate} 09:30:00`,
                distance: 20_000,
              },
            ]
          : [],
    });
  });

  await page.context().route('https://tiles.openfreemap.org/**', async (route) => {
    tiles++;
    if (route.request().url().endsWith('/planet'))
      return route.fulfill({
        json: { tiles: ['https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf'] },
      });
    return route.fulfill({ status: 204 });
  });
  return { downloads, exchanges, offsets, tiles: () => tiles };
}

async function submitKey(page: Page, value: string): Promise<void> {
  await page.getByRole('button', { name: 'Connect to Garmin', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect to Garmin Connect' });
  const field = dialog.getByLabel('Garmin Personal API key');
  await expect(field).toHaveAttribute('type', 'password');
  await expect(field).toHaveValue('');
  await field.fill(value);
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(dialog).toBeHidden();
}

test('replays a selected Garmin activity without adding it to the file library', async ({
  page,
}) => {
  const mock = await fakeGarmin(page);
  await page.goto('/');
  await page
    .getByTestId('file-input')
    .setInputFiles(new URL('morning-ride.fit', fixtures).pathname);
  await expect(page.getByTestId('activity-count')).toHaveText('1 activity on this device');
  await submitKey(page, key);
  await expect(page.getByRole('heading', { name: 'Choose your activities' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('No Garmin Connect activities in this period.');

  await page.getByRole('button', { name: 'Last year', exact: true }).click();
  const activities = page.getByTestId('chosen');
  await expect(activities).toContainText(rideName);
  await expect(activities).toContainText('Garmin indoor ride');
  await expect(activities).not.toContainText('outside the selected period');
  expect(mock.offsets).toContain('99');
  expect(mock.downloads).toEqual([]);

  const lower = page.getByRole('slider', { name: 'Minimum distance' });
  const upper = page.getByRole('slider', { name: 'Maximum distance' });
  const maximum = page.getByRole('textbox', { name: 'Maximum (km)' });
  await expect(lower).toHaveValue('10');
  await expect(upper).toHaveValue('20');
  await maximum.fill('12');
  await upper.press('ArrowRight');
  await expect(maximum).toHaveValue('12.1');
  await expect(activities).toContainText(rideName);
  await expect(activities).not.toContainText('Garmin indoor ride');
  await upper.press('End');
  await expect(maximum).toHaveValue('');
  await expect(activities).toContainText('Garmin indoor ride');

  const ride = page.getByRole('checkbox', { name: rideName });
  const next = page.getByRole('button', { name: 'Continue' });
  await expect(ride).not.toBeChecked();
  await ride.check();
  expect(mock.downloads).toEqual([]);
  await next.click();
  await expect(page.getByRole('heading', { name: 'How should your routes play?' })).toBeVisible();
  expect(mock.downloads).toEqual([rideId]);
  await next.click();
  await expect(page.getByTestId('preview').getByRole('img')).toBeVisible();
  await next.click();
  await page.getByRole('button', { name: 'Make video' }).click();
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 60_000 });
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.mp4$/);
  expect(mock.tiles()).toBeGreaterThan(0);
  expect(mock.downloads).toEqual([rideId]);

  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await page.getByRole('button', { name: 'Disconnect Garmin Connect' }).click();
  await expect(
    page.getByText('Garmin Connect disconnected and temporary activities cleared.'),
  ).toBeVisible();
  const library = page.getByTestId('library');
  await expect(library).toContainText('morning-ride');
  await expect(page.getByTestId('activity-count')).toHaveText('1 activity on this device');
  await expect(library).not.toContainText(rideName);
  await expect(page.getByTestId('result')).toHaveCount(0);

  const storage = await page.evaluate(async () => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
    cacheNames: await caches.keys(),
  }));
  const stored = JSON.stringify({ ...storage, cookies: await page.context().cookies() });
  expect(stored).not.toContain(key);
  expect(stored).not.toContain(token);
  expect(storage.cacheNames.some((name) => name.includes('garmin'))).toBe(false);
  expect(mock.exchanges).toEqual([key]);
});

test('clears a rejected key and starts fresh after reloading a Garmin session', async ({
  page,
}) => {
  const mock = await fakeGarmin(page);
  await page.goto('/');
  await submitKey(page, 'rejected-test-key');
  await expect(page.getByRole('alert')).toContainText('did not accept this Personal API key');
  await submitKey(page, key);
  await expect(page.getByRole('heading', { name: 'Choose your activities' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('No Garmin Connect activities in this period.');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Choose an activity source' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect to Garmin', exact: true })).toBeVisible();
  expect(mock.exchanges).toEqual(['rejected-test-key', key]);
});

test('offers file import when the Garmin Connect Personal API is disabled', async ({ page }) => {
  await page.route(endpoint, (route) => route.fulfill({ status: 404, json: {} }));
  const availability = page.waitForResponse(endpoint);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose files' })).toBeVisible();
  expect((await availability).status()).toBe(404);
  await expect(page.getByRole('button', { name: 'Connect to Garmin', exact: true })).toHaveCount(0);
});
