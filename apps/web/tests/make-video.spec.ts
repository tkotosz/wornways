import { readFile } from 'node:fs/promises';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const fixtures = new URL('../../../packages/engine/tests/import/fixtures/', import.meta.url);
const fixture = (name: string) => new URL(name, fixtures).pathname;

/**
 * Answers map requests without the network: a tile address template, and an empty
 * response for every tile (as for open sea). Returns how many requests it answered.
 */
async function offlineMap(context: BrowserContext): Promise<() => number> {
  let requests = 0;
  await context.route('https://tiles.openfreemap.org/**', async (route) => {
    requests++;
    if (route.request().url().endsWith('/planet'))
      return route.fulfill({
        json: { tiles: ['https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf'] },
      });
    return route.fulfill({ status: 204 });
  });
  return () => requests;
}

const longDay = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const monthTitle = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

/** Picks a day in the calendar of the date field with this label. */
async function pickDay(page: Page, label: string, year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);
  await page.getByRole('button', { name: new RegExp(`^${label}:`) }).click();
  const calendar = page.getByRole('dialog', { name: `Choose the ${label} day` });
  const target = monthTitle.format(date);
  for (
    let i = 0;
    i < 240 && !(await calendar.getByText(target, { exact: true }).isVisible());
    i++
  ) {
    const shown = new Date(`1 ${await calendar.locator('strong').innerText()}`);
    await calendar
      .getByRole('button', { name: shown > date ? 'Previous month' : 'Next month' })
      .click();
  }
  await calendar.getByRole('button', { name: longDay.format(date), exact: true }).click();
}

async function addFiles(page: Page, ...names: string[]): Promise<void> {
  await page.getByTestId('file-input').setInputFiles(names.map(fixture));
  await expect(page.getByTestId('import-report')).toBeVisible();
}

test('adds an account export and keeps it for the next visit', async ({ page }) => {
  await page.goto('/');
  // The file instructions open on request.
  const guideLink = page.getByRole('button', { name: 'How to get your files' });
  const guide = page.getByRole('dialog', { name: 'How to get your files' });
  await expect(page.getByTestId('intro')).toBeVisible();
  await expect(guide).toBeHidden();
  await guideLink.click();
  await expect(guide.getByRole('link', { name: 'Export Your Data' })).toBeVisible();
  await guide.getByRole('button', { name: 'Close' }).click();
  await expect(guide).toBeHidden();
  await expect(guideLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(guide).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(guide).toBeHidden();
  await addFiles(page, 'strava-export.zip');
  await expect(page.getByTestId('intro')).toHaveCount(0);

  await expect(page.getByTestId('import-report')).toContainText('3 activities added');
  await expect(page.getByTestId('activity-count')).toHaveText('3 activities on this device');
  const library = page.getByTestId('library');
  await expect(library).toContainText('Balaton loop, windy');
  await expect(library).toContainText('Virtual ride');

  await page.reload();
  // With activities stored, the app opens at the Choose step.
  await expect(page.getByRole('heading', { name: 'Choose your activities' })).toBeVisible();
  await page.getByRole('button', { name: 'About', exact: true }).click();
  const about = page.getByRole('dialog', { name: 'About Wornways' });
  await expect(about.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
    'href',
    '/privacy.html',
  );
  await expect(about.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/tkotosz/wornways',
  );
  await expect(about.getByRole('link', { name: 'Licenses' })).toHaveAttribute(
    'href',
    '/licenses.txt',
  );
  await about.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(guide).toBeHidden();
  await expect(page.getByTestId('activity-count')).toHaveText('3 activities on this device');
});

test('reports the files it cannot use and adds an activity only once', async ({ page }) => {
  await page.goto('/');
  await addFiles(page, 'morning-ride.fit', 'trail-run.tcx', 'no-gps-data.gpx', 'broken.fit');

  const report = page.getByTestId('import-report');
  await expect(report).toContainText('2 activities added');
  await expect(report).toContainText('1 activity has no GPS route');
  await expect(report).toContainText('broken.fit: not a FIT file');

  await addFiles(page, 'trail-run.tcx');
  await expect(report).toContainText('0 activities added, 1 already there');
  await expect(page.getByTestId('activity-count')).toHaveText('2 activities on this device');

  await page.getByRole('button', { name: 'Close the import report' }).click();
  await expect(report).toHaveCount(0);
});

test('adds an activity once, also from another file of it', async ({ page }) => {
  await page.goto('/');
  await addFiles(page, 'morning-ride.fit');
  await page.getByTestId('file-input').setInputFiles({
    name: 'Morning_Ride.gpx',
    mimeType: 'application/gpx+xml',
    buffer: await readFile(fixture('morning-ride.gpx')),
  });

  await expect(page.getByTestId('import-report')).toContainText(
    '0 activities added, 1 already there',
  );
  await expect(page.getByTestId('activity-count')).toHaveText('1 activity on this device');
});

test('adds a Garmin export as it is, with the ZIP files inside it', async ({ page }) => {
  await page.goto('/');
  await addFiles(page, 'garmin-export.zip');

  const report = page.getByTestId('import-report');
  await expect(report).toContainText('1 activity added');
  await expect(report).toContainText('1 activity has no GPS route');
  await expect(page.getByTestId('library')).toContainText('Lakeside loop');
});

test('deletes one activity, then all of them', async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.goto('/');
  await addFiles(page, 'morning-ride.fit', 'trail-run.tcx');
  // The library has no checkboxes: it is not a choice for the video.
  await expect(page.getByTestId('library').getByRole('checkbox')).toHaveCount(0);

  await page.getByRole('button', { name: 'Delete trail-run' }).click();
  await expect(page.getByTestId('activity-count')).toHaveText('1 activity on this device');

  await page.getByRole('button', { name: 'Delete saved activities' }).click();
  await page.getByRole('button', { name: 'Keep them' }).click();
  await expect(page.getByTestId('activity-count')).toHaveText('1 activity on this device');
  await page.getByRole('button', { name: 'Delete saved activities' }).click();
  await page.getByRole('button', { name: 'Delete all', exact: true }).click();
  await expect(page.getByTestId('library')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Choose an activity source' })).toBeVisible();
});

test('ticks and unticks every activity shown with the header box', async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.goto('/');
  await addFiles(page, 'morning-ride.fit', 'trail-run.tcx', 'strava-export.zip');
  await page.getByRole('button', { name: 'Continue' }).click();
  const count = page.getByTestId('chosen-count');
  const selectAll = page.getByRole('checkbox', { name: 'Select all shown' });

  await expect(count).toContainText('5 of 5 activities selected');
  await selectAll.click();
  await expect(count).toContainText('0 of 5 activities selected');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await page.getByTestId('chosen').getByText('trail-run').click();
  await expect(count).toContainText('1 of 5 activities selected');
  expect(await selectAll.evaluate((box) => (box as HTMLInputElement).indeterminate)).toBe(true);
  await selectAll.click();
  await expect(count).toContainText('5 of 5 activities selected');
  // Nothing can be deleted while choosing.
  await expect(page.getByRole('button', { name: /^Delete/ })).toHaveCount(0);
});

test('chooses activities with filters and by hand', async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.goto('/');
  await addFiles(page, 'strava-export.zip', 'morning-ride.fit');
  await page.getByRole('button', { name: 'Continue' }).click();

  // "All" is picked at first: every sport, virtual rides too.
  const chosen = page.getByTestId('chosen');
  const count = page.getByTestId('chosen-count');
  const chip = (name: string) => page.getByRole('button', { name, exact: true });
  await expect(chip('All')).toHaveAttribute('aria-pressed', 'true');
  await expect(count).toContainText('4 of 4 activities');
  await expect(chosen).toContainText('Zwift in Watopia');

  // Picking a sport replaces "All"; unpicking the last one brings "All" back.
  await chip('Virtual ride').click();
  await expect(chip('All')).toHaveAttribute('aria-pressed', 'false');
  await expect(count).toContainText('1 of 1 activity');
  await chip('Ride').click();
  await expect(count).toContainText('3 of 3 activities');
  await chip('Run').click();
  await expect(count).toContainText('4 of 4 activities');

  // A period narrows the list.
  await page.getByRole('button', { name: 'Custom' }).click();
  await pickDay(page, 'From', 2026, 3, 1);
  await pickDay(page, 'To', 2026, 3, 31);
  await expect(page.getByRole('button', { name: /^To:/ })).toHaveText('31 Mar 2026');
  await expect(count).toContainText('of 3 activities');
  await expect(chosen).not.toContainText('morning-ride');

  // Only sports with activities in the period are offered, but a picked one stays.
  const sports = page.getByRole('button', { name: /^(All|Ride|Run|Virtual ride)$/ });
  await pickDay(page, 'To', 2026, 3, 15); // no run until the 16th
  await expect(sports).toHaveText(['All', 'Ride', 'Run', 'Virtual ride']);
  await chip('Run').click();
  await expect(sports).toHaveText(['All', 'Ride', 'Virtual ride']);
  await pickDay(page, 'To', 2026, 3, 31);
  await expect(chip('Run')).toHaveAttribute('aria-pressed', 'false');
  await chip('Run').click();

  await chosen.getByText('Zwift in Watopia').click();
  await expect(page.getByTestId('chosen-count')).toContainText('2 of 3 activities');
  await page.getByRole('checkbox', { name: 'Select all shown' }).click(); // some ticked: ticks all
  await page.getByRole('checkbox', { name: 'Select all shown' }).click(); // all ticked: unticks all
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
});

test('keeps the distance slider scale steady until other filters change', async ({ page }) => {
  await page.goto('/');
  await addFiles(page, 'morning-ride.fit', 'strava-export.zip');
  await page.getByRole('button', { name: 'Continue' }).click();

  const minimum = page.getByRole('textbox', { name: 'Minimum (km)' });
  const maximum = page.getByRole('textbox', { name: 'Maximum (km)' });
  const lower = page.getByRole('slider', { name: 'Minimum distance' });
  const upper = page.getByRole('slider', { name: 'Maximum distance' });
  await expect(lower).toBeVisible();
  const low = Number(await lower.getAttribute('min'));
  const high = Number(await upper.getAttribute('max'));
  await expect(lower).toHaveValue(String(low));
  await expect(upper).toHaveValue(String(high));
  await expect(minimum).toHaveValue('');
  await expect(maximum).toHaveValue('');

  await lower.press('ArrowRight');
  await expect(minimum).toHaveValue(String(low + 0.1));
  await lower.press('Home');
  await expect(minimum).toHaveValue('');
  const track = await page.getByRole('group', { name: 'Distance' }).locator('.track').boundingBox();
  if (!track) throw new Error('Distance slider track is missing');
  const y = track.y + track.height / 2;
  await page.mouse.move(track.x + track.width, y);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.75, y, { steps: 8 });
  await page.mouse.up();
  await expect(maximum).not.toHaveValue('');
  expect(Number(await maximum.inputValue())).toBeLessThan(high);
  await maximum.fill('9,2');
  await expect(page.getByTestId('chosen-count')).toContainText('of 1 activity');
  await page.getByRole('checkbox', { name: 'Select all shown' }).uncheck();
  await expect(upper).toHaveAttribute('max', String(high));
  await expect(lower).toHaveAttribute('min', String(low));

  await page.getByRole('button', { name: 'Ride', exact: true }).click();
  await expect(lower).not.toHaveAttribute('min', String(low));
  await expect(maximum).toHaveValue('9,2');
  await page.getByRole('button', { name: 'Virtual ride', exact: true }).click();
  await page.getByRole('button', { name: 'Ride', exact: true }).click();
  await expect(lower).toHaveCount(0);
  await expect(maximum).toHaveValue('9,2');
});

test('makes a video of activities within the chosen distance range', async ({ page, context }) => {
  const mapRequests = await offlineMap(context);
  await page.goto('/');
  await addFiles(page, 'morning-ride.fit', 'strava-export.zip');
  await page.getByTestId('file-input').setInputFiles({
    name: 'trail, run.tcx',
    mimeType: 'application/xml',
    buffer: await readFile(fixture('trail-run.tcx')),
  });
  await expect(page.getByTestId('activity-count')).toContainText('5 activities');
  await page.getByRole('button', { name: 'Continue' }).click();
  const count = page.getByTestId('chosen-count');
  const minimum = page.getByRole('textbox', { name: 'Minimum (km)' });
  const maximum = page.getByRole('textbox', { name: 'Maximum (km)' });
  await minimum.fill('9');
  await expect(count).toContainText('4 of 4 activities');
  await maximum.fill('8');
  await expect(page.getByRole('alert')).toContainText('minimum must be at or below the maximum');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await maximum.fill('9');
  await expect(page.getByRole('alert')).toHaveText('No activities match the distance range.');
  await maximum.fill('40');
  await expect(count).toContainText('3 of 3 activities');
  await page.getByRole('button', { name: 'Continue' }).click(); // to Playback
  await page.getByRole('button', { name: 'Continue' }).click(); // to Appearance
  await page.getByRole('button', { name: 'Continue' }).click(); // to Export

  await expect(page.getByText('A replay of 3 activities')).toBeVisible();
  await expect(page.getByTestId('video-summary')).toHaveText('1080 × 1920 · 30 s + end card');
  await page.getByRole('button', { name: 'Make video' }).click();
  await expect(page.getByTestId('progress')).toBeVisible();
  const result = page.getByTestId('result');
  await expect(result).toBeVisible({ timeout: 150_000 });
  await expect(page.getByTestId('made')).toContainText('3 activities');
  await expect(page.getByText('could not be loaded')).toHaveCount(0);
  expect(mapRequests()).toBeGreaterThan(1);

  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: /Download/ }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^replay-2026-03-\d\d-to-2026-04-27\.mp4$/);
  const video = await readFile(await download.path());
  expect(video.length).toBeGreaterThan(50_000);
  expect(video.subarray(4, 8).toString('latin1')).toBe('ftyp'); // an MP4 file
});

test('keeps the video while the choice stays the same', async ({ page, context }) => {
  await offlineMap(context);
  await page.goto('/');
  await addFiles(page, 'morning-ride.fit', 'trail-run.tcx');
  await page.getByRole('button', { name: 'Continue' }).click(); // to Activities
  await page.getByRole('button', { name: 'Continue' }).click(); // to Playback
  await page.getByRole('button', { name: 'Continue' }).click(); // to Appearance
  await page.getByRole('button', { name: 'Continue' }).click(); // to Export
  await page.getByRole('button', { name: 'Make video' }).click();
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 150_000 });

  await page.getByRole('button', { name: '← Back' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('result')).toBeVisible();
  // With a video made, the next thing to do is to download it.
  await expect(page.getByRole('link', { name: 'Download', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Make (video|it again)$/ })).toHaveCount(0);
  // This browser cannot share files, so there is nothing to share with.
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Activities', exact: true }).click();
  await page.getByTestId('chosen').getByText('trail-run').click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByTestId('result')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Make video' })).toBeVisible();
});

test('shares the video where the browser can share files', async ({ page, context }) => {
  await offlineMap(context);
  // Chromium on Linux cannot share files; this stands in for a phone's share sheet.
  await page.addInitScript(`{
    navigator.canShare = (data) => (data.files ?? []).every((file) => file.type === 'video/mp4');
    navigator.share = async ({ files }) => {
      window.shared = files.map((file) => [file.name, file.type, file.size]);
    };
  }`);
  await page.goto('/');
  await addFiles(page, 'morning-ride.fit');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Make video' }).click();
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 150_000 });

  await expect(page.getByRole('link', { name: 'Download', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect
    .poll(() => page.evaluate('window.shared'))
    .toEqual([['activity-morning-ride.mp4', 'video/mp4', expect.any(Number)]]);
  const [[, , size]] = (await page.evaluate('window.shared')) as [string, string, number][];
  expect(size).toBeGreaterThan(10_000);
});

test('sets a start place as typed, from the current location or on the map', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await page.goto('/');
  await addFiles(page, 'morning-ride.fit', 'trail-run.tcx');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Starts near a place').check();

  // Without a place the filter waits, and the next step does too. (No location permission
  // is granted yet, so the current location is not filled in by itself.)
  const start = page.getByTestId('start-near');
  await expect(start).toContainText('Set the place to use this filter');
  await expect(page.getByTestId('chosen-count')).toContainText('of 2 activities');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();

  await start.getByLabel('Start place').fill('10, 10');
  await expect(page.getByRole('alert')).toHaveText(
    'None of these activities starts near the chosen place.',
  );
  await start.getByLabel('Start place').fill('somewhere');
  await expect(start).toContainText('Write it as latitude, longitude');

  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 47.4979, longitude: 19.0402 });
  await start.getByRole('button', { name: 'Use my current location' }).click();
  await expect(start.getByLabel('Start place')).toHaveValue('47.49790, 19.04020');

  // The map shows with the panel and suggests where activities start; one is picked.
  await expect(start.getByTestId('place-map')).toBeVisible();
  await expect(start.getByRole('button', { name: 'Zoom in' })).toBeVisible();
  await expect(start.getByRole('button', { name: /^\d \d start ·/ })).toHaveCount(2);
  // The suggestions follow the sport filter: with rides only, one place is left.
  await page.getByRole('button', { name: 'Ride', exact: true }).click();
  await expect(start.getByRole('button', { name: /^\d \d start ·/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Ride', exact: true }).click();
  await start.getByRole('button', { name: /^1 1 start ·/ }).click();
  await expect(start.getByLabel('Start place')).not.toHaveValue('47.49790, 19.04020');
  await expect(page.getByTestId('chosen-count')).toContainText('1 of 1 activity');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
});

test('starts the end place at the start place, then keeps both filters apart', async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.goto('/');
  await addFiles(page, 'morning-ride.fit', 'trail-run.tcx');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Starts near a place').check();
  const start = page.getByTestId('start-near');
  await start.getByRole('button', { name: /^1 1 start ·/ }).click();
  const startPlace = await start.getByLabel('Start place').inputValue();

  // Turned on second, the end filter starts at the start place; its suggestions are ends.
  await page.getByLabel('Ends near a place').check();
  const end = page.getByTestId('end-near');
  await expect(end.getByLabel('End place')).toHaveValue(startPlace);
  await expect(end.getByRole('button', { name: /^\d \d end ·/ })).toHaveCount(2);
  await expect(end.getByLabel('End radius')).toHaveValue('1000');

  await end.getByLabel('End place').fill('10, 10');
  await expect(page.getByRole('alert')).toHaveText(
    'None of these activities starts and ends near the chosen places.',
  );
  await page.getByLabel('Ends near a place').uncheck();
  await expect(end).toHaveCount(0);
  await expect(page.getByTestId('chosen-count')).toContainText('1 of 1 activity');
});

test('starts a place at the current location when the browser allows it', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 51.505, longitude: -0.0214 });
  await page.goto('/');
  await addFiles(page, 'morning-ride.fit', 'trail-run.tcx');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Starts near a place').check();

  await expect(page.getByLabel('Start place')).toHaveValue('51.50500, -0.02140');
  await expect(page.getByTestId('chosen-count')).toContainText('1 of 1 activity');
});

test('sets up the video and its text, and keeps both for the next visit', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(30_000);
  await offlineMap(context);
  await page.goto('/');
  await addFiles(page, 'morning-ride.fit', 'trail-run.tcx');
  await page.getByRole('button', { name: 'Continue' }).click(); // to Activities
  await page.getByRole('button', { name: 'Continue' }).click(); // to Playback
  const chip = (name: string) => page.getByRole('button', { name, exact: true });
  const slider = (name: string) => page.getByRole('slider', { name });
  const preset = (name: string) => page.getByRole('radio', { name: new RegExp(`^${name}`) });

  // The Playback step: the first preset, All at once, at first, with a summary telling
  // what it plays. Recap: 30 s, less 0.4 s before and 0.3 s after the activities.
  const pacing = page.getByTestId('pacing');
  const summary = page.getByTestId('replay-summary');
  await expect(page.getByRole('radio').first()).toHaveAccessibleName(/^All at once/);
  await expect(preset('All at once')).toHaveAttribute('aria-checked', 'true');
  await expect(summary).toHaveText('30 seconds · All at once');
  await preset('Recap').click();
  await expect(summary).toHaveText('30 seconds · Recap');
  await expect(pacing).toHaveText('This video: 2 activities, 14.7 s each.');
  await preset('Multiday trip').click();
  await expect(summary).toHaveText('45 seconds · Multiday trip');
  await expect(pacing).toHaveText(/^This video: 2 days \(2 activities\), [\d.]+–[\d.]+ s each\.$/);
  await preset('All at once').click();
  await expect(pacing).toHaveText('This video: a race of all 2 activities, each at its real pace.');

  // Fine-tune playback opens below, starting from the preset's values; changing one of
  // them makes it Custom, and no preset is picked any more.
  await page.getByRole('button', { name: /Fine-tune playback/ }).click();
  await expect(chip('All')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip('Real pace')).toHaveAttribute('aria-pressed', 'true');
  await chip('Activity').click();
  await expect(summary).toHaveText('30 seconds · Custom playback');
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(pacing).toHaveText('This video: 2 activities, 14.7 s each.');
  // Overlap: the second starts when the first is half drawn, so each stays on screen longer.
  await slider('Overlap').fill('50');
  await slider('Overlap').dispatchEvent('change');
  await expect(pacing).toHaveText('This video: 2 activities, 19.5 s each, overlapping 50%.');
  await slider('Overlap').fill('0');
  await slider('Overlap').dispatchEvent('change');
  await chip('All').click();
  await expect(pacing).toHaveText('This video: a race of all 2 activities, each at its real pace.');
  await slider('Video length').fill('10');
  await slider('Video length').dispatchEvent('change');
  await expect(summary).toHaveText('10 seconds · Custom playback');

  // The Appearance step: the title starts as the automatic one, with its position and size.
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Make it yours' })).toBeVisible();
  const title = page.getByRole('textbox', { name: 'Title' });
  await expect(title).toHaveValue('27 Apr – 2 May 2026');
  await title.fill('Spring');
  // Switched off, the title's settings hide; switched on again, the text is still there.
  await page.getByRole('switch', { name: 'Show title' }).click();
  await expect(title).toHaveCount(0);
  await page.getByRole('switch', { name: 'Show title' }).click();
  await expect(title).toHaveValue('Spring');
  // Nine positions: the middle row too.
  await expect(
    page.getByTestId('group-title').getByRole('button', { name: 'Center' }),
  ).toBeVisible();
  await page.getByTestId('group-title').getByRole('button', { name: 'Bottom middle' }).click();
  await expect(page.getByTestId('group-metrics')).toContainText('Show metrics');
  await slider('Size').first().fill('150');
  await slider('Size').first().dispatchEvent('change');
  // The end card is on unless switched off; off, the video is the replay alone.
  const endCard = page.getByRole('switch', { name: 'Show end card' });
  await expect(endCard).toBeChecked();
  await endCard.click();
  await expect(page.getByRole('switch', { name: 'Show watermark' })).toBeChecked();

  // The live preview shows the finished picture in the frame, which is picked here too.
  const picture = page.getByRole('img', { name: 'Preview: the last frame of the video' });
  const pictureSize = () =>
    picture.evaluate((img) => {
      const { naturalWidth, naturalHeight } = img as unknown as {
        naturalWidth: number;
        naturalHeight: number;
      };
      return `${naturalWidth}x${naturalHeight}`;
    });
  await expect.poll(pictureSize).toBe('270x480');
  await chip('Square 1:1').click();
  await chip('24 fps').click();
  await expect.poll(pictureSize).toBe('480x480');

  // The Export step: only the video.
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('video-summary')).toHaveText('1080 × 1080 · 10 s');
  await page.getByRole('button', { name: 'Make video' }).click();
  const result = page.getByTestId('result');
  await expect(result).toBeVisible({ timeout: 150_000 });
  await expect(page.getByTestId('made')).toContainText('10.0 s');

  await page.reload();
  await page.getByRole('button', { name: 'Playback', exact: true }).click();
  await expect(summary).toHaveText('10 seconds · Custom playback');
  await page.getByRole('button', { name: /Fine-tune playback/ }).click();
  await expect(chip('All')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip('Real pace')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await expect(chip('Square 1:1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Spring');
  await expect(page.getByRole('switch', { name: 'Show end card' })).not.toBeChecked();
  await expect(
    page.getByTestId('group-title').getByRole('button', { name: 'Bottom middle' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('offers Highlight for a single activity, and the other presets for several', async ({
  page,
}) => {
  page.setDefaultTimeout(15_000);
  await page.goto('/');
  await addFiles(page, 'morning-ride.fit', 'trail-run.tcx');
  await page.getByRole('button', { name: 'Continue' }).click(); // to Activities
  await page.getByTestId('chosen').getByText('trail-run').click();
  await page.getByRole('button', { name: 'Continue' }).click(); // to Playback
  const presets = page.getByRole('radio');
  const preset = (name: string) => page.getByRole('radio', { name: new RegExp(`^${name}`) });

  // One activity: Highlight, a 15-second clip.
  await expect(presets).toHaveCount(1);
  await expect(preset('Highlight')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('pacing')).toHaveText(
    'One activity plays at its own pace, in 15 s; grouping does not apply.',
  );
  await page.getByRole('button', { name: /Fine-tune playback/ }).click();
  const camera = page.getByTestId('group-camera');
  const follows = camera.getByRole('button', { name: 'Follows', exact: true });
  await expect(follows).toHaveAttribute('aria-pressed', 'true');
  await camera.getByRole('button', { name: 'Fixed', exact: true }).click();
  await expect(preset('Highlight')).toHaveAttribute('aria-checked', 'false');
  await follows.click();
  await expect(follows).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Fine-tune playback/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Make it yours' })).toBeVisible();

  // Several: the presets for several, with their own default.
  await page.getByRole('button', { name: 'Activities', exact: true }).click();
  await page.getByTestId('chosen').getByText('trail-run').click();
  await page.getByRole('button', { name: 'Playback', exact: true }).click();
  await expect(presets).toHaveCount(3);
  await expect(preset('All at once')).toHaveAttribute('aria-checked', 'true');
});

test('keeps Back and Next in place while the page scrolls', async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/');
  await addFiles(page, 'strava-export.zip', 'morning-ride.fit', 'trail-run.tcx');
  await page.getByRole('button', { name: 'Continue' }).click();
  const next = page.getByRole('button', { name: 'Continue' });

  const tops = new Set<number>();
  for (const top of [0, 200, 400, 100_000]) {
    await page.evaluate((y) => {
      (globalThis as unknown as { scrollTo(o: { top: number }): void }).scrollTo({ top: y });
    }, top);
    tops.add(Math.round((await next.boundingBox())!.y));
  }
  // The same place at every scroll position, the end of the page included.
  expect([...tops]).toHaveLength(1);
});
