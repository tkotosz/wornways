import { expect, test, type Page } from '@playwright/test';
import { offlineMap } from './offline-map.ts';
import {
  activitiesPopup,
  openSection,
  pickPeriod,
  pickSource,
  render,
  renderPopup,
  switchSource,
  useActivities,
} from './popups.ts';

const ride = new URL(
  '../../../packages/engine/tests/import/fixtures/morning-ride.fit',
  import.meta.url,
).pathname;

/** Picks the demo, which goes straight to its activities, and the period of all of them. */
async function startDemo(page: Page): Promise<void> {
  await expect(page.getByTestId('choose-demo')).toContainText('25 made-up activities');
  await pickSource(page, 'demo');
  await pickPeriod(page);
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
  await useActivities(page);
  // The demo keeps nothing on this device: no files or connection to manage.
  await expect(page.getByRole('button', { name: 'Files on this device' })).toHaveCount(0);
  await render(page);
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText('could not be loaded')).toHaveCount(0);
  await renderPopup(page).getByRole('button', { name: 'Close' }).click();

  // Changing to files: nothing of the demo was kept, also after a reload.
  await switchSource(page);
  await pickSource(page, 'files');
  const files = page.getByRole('dialog', { name: 'Files on this device' });
  await expect(files.getByRole('button', { name: 'Choose files' })).toBeVisible();
  await expect(page.getByTestId('activity-count')).toHaveCount(0);
  await page.reload();
  await expect(files).toBeVisible();
  await expect(page.getByTestId('activity-count')).toHaveCount(0);
});

test('offers the demo next to the files on this device, and keeps them apart', async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.goto('/');
  await pickSource(page, 'files');
  await page.getByTestId('file-input').setInputFiles(ride);
  await expect(page.getByTestId('activity-count')).toHaveText('1 activity on this device');

  // The list of sources says what each holds.
  await switchSource(page);
  await expect(page.getByTestId('choose-files')).toContainText('1 activity on this device');
  await startDemo(page);
  await expect(page.getByTestId('chosen-count')).toContainText('25 of 25');

  // The demo's activities never join the files, and the files come back as they were, also
  // after a reload.
  await switchSource(page);
  await pickSource(page, 'files');
  await expect(page.getByTestId('source')).toContainText('Files on this device');
  await pickPeriod(page);
  await expect(page.getByTestId('chosen-count')).toContainText('1 of 1 activity');
  await page.reload();
  await expect(activitiesPopup(page)).toBeVisible();
  await pickPeriod(page);
  await expect(page.getByTestId('chosen-count')).toContainText('1 of 1 activity');
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
  await useActivities(page);
  await openSection(page, 'Playback');
  await expect(page.getByTestId('replay-summary')).toContainText('Highlight');

  // The demo's routes carry heights: one activity starts with the elevation chart, and its
  // climb, start time, descent, highest point and top speed can be added; a count cannot.
  await openSection(page, 'Overlay');
  await expect(page.getByRole('button', { name: 'Elevation chart', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add a widget' }).click();
  const add = page.getByRole('dialog', { name: 'Add a widget' });
  for (const name of ['Climbed', 'Start time', 'Descent', 'Highest point', 'Top speed'])
    await expect(add.getByRole('button', { name: new RegExp(` ${name}$`) })).toBeEnabled();
  await expect(add.getByRole('button', { name: / Count$/ })).toHaveCount(0);
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
  await expect(activitiesPopup(page)).toBeVisible();
  expect(demoRequests.length).toBeGreaterThan(0);
});

test('asks for a period before it shows the activities', async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.goto('/');
  await pickSource(page, 'demo');
  // Nothing is picked for the person: no period, no list, no way on.
  await expect(page.getByText('Which activities? Pick a period.')).toBeVisible();
  await expect(page.getByTestId('chosen')).toHaveCount(0);
  await expect(page.getByText('Sports')).toHaveCount(0);
  const use = activitiesPopup(page).getByRole('contentinfo').getByRole('button');
  await expect(use).toBeDisabled();

  await pickPeriod(page, 'Last month');
  await pickPeriod(page, 'All time');
  await expect(page.getByTestId('chosen-count')).toContainText('25 of 25');
  await expect(use).toBeEnabled();
  await expect(use).toHaveText('Use 25 activities');
});
