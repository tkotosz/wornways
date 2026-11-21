import { expect, test } from '@playwright/test';
import { offlineMap } from './offline-map.ts';

const ride = new URL(
  '../../../packages/engine/tests/import/fixtures/morning-ride.fit',
  import.meta.url,
).pathname;

test('tries the demo, makes a video of it, and leaves the own library as it was', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await page.goto('/');
  // One activity of the person's own, to see that the demo leaves it alone.
  await page.getByTestId('file-input').setInputFiles(ride);
  await expect(page.getByTestId('activity-count')).toHaveText('1 activity on this device');

  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page.getByTestId('source')).toContainText('Demo: made-up activities in Mallorca');
  const count = page.getByTestId('chosen-count');
  await expect(count).toContainText('25 of 25 activities selected');
  await expect(page.getByTestId('demo-guide')).toContainText('Things to try');

  // Just one short run, to keep the video quick.
  await page.getByRole('checkbox', { name: 'Select all shown' }).click();
  await page.getByTestId('chosen').getByText('Easy run').click();
  await expect(count).toContainText('1 of 25 activities selected');
  await page.getByRole('button', { name: 'Continue' }).click(); // to Playback
  await page.getByRole('button', { name: 'Continue' }).click(); // to Appearance
  await page.getByRole('button', { name: 'Continue' }).click(); // to Export
  await page.getByRole('button', { name: 'Make video' }).click();
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText('could not be loaded')).toHaveCount(0);

  await page.getByRole('button', { name: 'Activities', exact: true }).click();
  await page.getByRole('button', { name: 'Leave the demo' }).click();
  await expect(page.getByRole('heading', { name: 'Choose an activity source' })).toBeVisible();
  await expect(page.getByTestId('activity-count')).toHaveText('1 activity on this device');
  await page.reload();
  // Back on the own files, which have no guide.
  await expect(page.getByTestId('source')).toContainText('Files on this device');
  await expect(page.getByTestId('demo-guide')).toHaveCount(0);
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(page.getByTestId('activity-count')).toHaveText('1 activity on this device');
});

test('offers only the demo on the source step while it is open', async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page.getByTestId('chosen-count')).toContainText('25 of 25');

  await page.getByRole('button', { name: 'Source', exact: true }).click();
  const demo = page.getByTestId('demo-source');
  await expect(demo).toContainText('Leave the demo to add your own files or connect Strava');
  await expect(page.getByRole('heading', { name: 'Files' })).toHaveCount(0);
  await expect(page.getByTestId('file-input')).toHaveCount(0);

  await demo.getByRole('button', { name: 'Leave the demo' }).click();
  await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose files' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try the demo' })).toBeVisible();
});

test('follows the guide to a highlight of the long ride', async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page.getByTestId('demo-guide')).toContainText('Sa Calobra (18 April, 104 km)');

  await page.getByRole('checkbox', { name: 'Select all shown' }).click();
  const ride = page.getByTestId('chosen').getByRole('row').filter({ hasText: 'Sa Calobra' });
  await expect(ride).toContainText('18 Apr');
  await expect(ride).toContainText('104 km');
  await ride.click();
  await expect(page.getByTestId('chosen-count')).toContainText('1 of 25 activities selected');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('replay-summary')).toContainText('Highlight');
});

test('loads the demo only when it is opened, not with the app', async ({ page }) => {
  const worker = await (await page.request.get('/sw.js')).text();
  expect(worker).toContain('/index.html');
  expect(worker).not.toContain('demo/');

  const demoRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/demo/')) demoRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Try the demo' })).toBeVisible();
  expect(demoRequests).toEqual([]);
});
