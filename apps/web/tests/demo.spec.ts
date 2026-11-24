import { expect, test, type Page } from '@playwright/test';
import { offlineMap } from './offline-map.ts';
import { pickSource } from './sources.ts';

const ride = new URL(
  '../../../packages/engine/tests/import/fixtures/morning-ride.fit',
  import.meta.url,
).pathname;

/** Picks the demo, which lists its activities, and goes on to choose from them. */
async function startDemo(page: Page): Promise<void> {
  await pickSource(page, 'demo');
  await expect(page.getByTestId('demo-count')).toHaveText('25 made-up activities');
  await page.getByRole('button', { name: 'Continue' }).click();
}

test('tries the demo, makes a video of it, and stores nothing on this device', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await page.goto('/');
  await startDemo(page);
  await expect(page.getByTestId('source')).toContainText(
    'Current source: Demo: made-up activities in Mallorca',
  );
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

  // Changing to files: nothing of the demo was kept, also after a reload.
  await page.getByRole('button', { name: 'Activities', exact: true }).click();
  await page.getByRole('button', { name: 'Change source' }).click();
  await pickSource(page, 'files');
  await expect(page.getByRole('button', { name: 'Choose files' })).toBeVisible();
  await expect(page.getByTestId('activity-count')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('chosen-source')).toHaveText('Files');
  await expect(page.getByTestId('activity-count')).toHaveCount(0);
});

test('offers the demo next to the files on this device, and keeps them apart', async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.goto('/');
  await pickSource(page, 'files');
  await page.getByTestId('file-input').setInputFiles(ride);
  await expect(page.getByTestId('activity-count')).toHaveText('1 activity on this device');

  // Changing source chooses none: the later steps wait for a new choice, also after a reload.
  await page.getByRole('button', { name: 'Change source' }).click();
  await expect(page.getByTestId('choose-files')).toContainText('1 activity on this device');
  await expect(page.getByTestId('chosen-source')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Activities', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '← Back', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('chosen-source')).toHaveCount(0);
  await expect(page.getByTestId('choose-demo')).toContainText('25 made-up activities');
  await startDemo(page);
  await expect(page.getByTestId('chosen-count')).toContainText('25 of 25');

  // The demo's activities never join the files, and the files come back as they were.
  await page.getByRole('button', { name: 'Change source' }).click();
  await pickSource(page, 'files');
  await expect(page.getByTestId('activity-count')).toHaveText('1 activity on this device');
});

test("shows the demo's own screen, and Change source lists every source", async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.goto('/');
  await startDemo(page);
  await expect(page.getByTestId('chosen-count')).toContainText('25 of 25');

  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(page.getByTestId('chosen-source')).toHaveText('Demo');
  await expect(page.getByTestId('demo-source')).toBeVisible();
  await expect(page.getByTestId('file-input')).toHaveCount(0);
  // The demo's activities are shown, but cannot be deleted.
  await expect(page.getByTestId('demo-activities')).toContainText('Sa Calobra');
  await expect(page.getByTestId('demo-activities').getByRole('button')).toHaveCount(0);

  await page.getByRole('button', { name: 'Change source' }).click();
  await expect(page.getByTestId('sources')).toContainText('Files');
  await expect(page.getByTestId('chosen-source')).toHaveCount(0);
  await pickSource(page, 'files');
  await expect(page.getByRole('button', { name: 'Choose files' })).toBeVisible();
});

test('follows the guide to a highlight of the long ride', async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.goto('/');
  await startDemo(page);
  await expect(page.getByTestId('demo-guide')).toContainText('Sa Calobra (18 April, 104 km)');

  await page.getByRole('checkbox', { name: 'Select all shown' }).click();
  const ride = page.getByTestId('chosen').getByRole('row').filter({ hasText: 'Sa Calobra' });
  await expect(ride).toContainText('18 Apr');
  await expect(ride).toContainText('104 km');
  await ride.click();
  await expect(page.getByTestId('chosen-count')).toContainText('1 of 25 activities selected');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('replay-summary')).toContainText('Highlight');

  // The demo's routes carry heights, so the climb can be shown.
  await page.getByRole('button', { name: 'Continue' }).click(); // to Appearance
  await expect(
    page.getByTestId('group-metrics').getByRole('button', { name: 'Elevation' }),
  ).toBeVisible();
  // One activity offers its start time and its descent, not picked at first, and no count.
  for (const name of ['Start time', 'Descent', 'Highest point', 'Top speed'])
    await expect(
      page.getByTestId('group-metrics').getByRole('button', { name, exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
  await expect(
    page.getByTestId('group-metrics').getByRole('button', { name: 'Count', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByTestId('group-elevation').getByRole('switch', { name: 'Elevation profile' }),
  ).toBeChecked();
});

test('loads the demo only when it is picked, not with the app', async ({ page }) => {
  const worker = await (await page.request.get('/sw.js')).text();
  expect(worker).toContain('/index.html');
  expect(worker).not.toContain('demo/');

  const demoRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/demo/')) demoRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByTestId('choose-demo')).toBeVisible();
  expect(demoRequests).toEqual([]);
  await pickSource(page, 'demo');
  await expect(page.getByTestId('demo-count')).toHaveText('25 made-up activities');
  expect(demoRequests.length).toBeGreaterThan(0);
});
