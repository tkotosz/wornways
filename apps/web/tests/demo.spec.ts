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
  // The files' choice is remembered: a reload goes straight to editing it.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Activities: 1' })).toBeVisible();
  await expect(activitiesPopup(page)).toBeHidden();
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

  // The demo's routes carry heights: one activity starts with its climb and the elevation
  // chart, and its start time, descent, elevations and speeds can be added; a count or the
  // values per activity cannot.
  await openSection(page, 'Overlay');
  await expect(page.getByRole('button', { name: 'Elevation chart', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add a stat' }).click();
  const add = page.getByRole('dialog', { name: 'Stats' });
  const tile = (name: string) => add.getByRole('button', { name: new RegExp(` ${name}$`) });
  await expect(tile('Climb')).toBeDisabled();
  for (const name of [
    'Start time',
    'Time of day',
    'Descent',
    'Max elevation',
    'Min elevation',
    'Current elevation',
    'Max speed',
    'Current speed',
  ])
    await expect(tile(name)).toBeEnabled();
  for (const name of ['Activities', 'Avg distance per activity', 'Max climb per activity'])
    await expect(tile(name)).toHaveCount(0);
  // Grouped by what they measure.
  await expect(add.getByRole('region', { name: 'Elevation' })).toContainText('Current elevation');
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

test('starts on all of its activities, ready to use', async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.goto('/');
  await pickSource(page, 'demo');
  // All time, everything ticked: the button takes them to the editor at once.
  await expect(page.getByRole('button', { name: 'All time', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('chosen-count')).toContainText('25 of 25');
  const use = activitiesPopup(page).getByRole('contentinfo').getByRole('button');
  await expect(use).toBeEnabled();
  await expect(use).toHaveText('Use 25 activities');

  // A narrower period narrows the list.
  await pickPeriod(page, 'Last month');
  await pickPeriod(page, 'All time');
  await expect(page.getByTestId('chosen-count')).toContainText('25 of 25');
});
