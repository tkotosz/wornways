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
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(page.getByTestId('activity-count')).toHaveText('1 activity on this device');
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
