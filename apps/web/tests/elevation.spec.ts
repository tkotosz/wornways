import { expect, test } from '@playwright/test';
import { offlineMap } from './offline-map.ts';
import { chooseStyle, openSection, pickPeriod, pickSource, useActivities } from './popups.ts';

test('starts a single activity with elevation with the elevation chart, which can be removed', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await page.goto('/');
  await pickSource(page, 'files');
  await page
    .getByTestId('file-input')
    .setInputFiles(
      new URL('../../../packages/engine/tests/import/fixtures/morning-ride.gpx', import.meta.url)
        .pathname,
    );
  await expect(page.getByTestId('activity-count')).toHaveText('1 activity on this device');
  await page.getByRole('button', { name: 'Choose activities' }).click();
  await pickPeriod(page);
  // One activity plays as a Highlight, without asking.
  await useActivities(page);
  await openSection(page, 'Overlay');

  // A single activity starts with the elevation chart on the picture.
  const chart = page.getByRole('button', { name: 'Elevation chart', exact: true });
  const onPicture = page.getByRole('button', { name: /^Elevation chart on the picture/ });
  await expect(chart).toBeVisible();
  await expect(onPicture).toBeVisible();
  // Removed, it leaves the list and the picture.
  await chart.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove from the picture' }).click();
  await expect(chart).toHaveCount(0);
  await expect(onPicture).toHaveCount(0);
});

test('offers no elevation chart where there is no elevation', async ({ page, context }) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  // A short ride recorded without heights.
  const points = Array.from(
    { length: 60 },
    (_, i) =>
      `<trkpt lat="47.5" lon="${(19 + i * 0.0005).toFixed(4)}"><time>2026-05-02T08:${String(i).padStart(2, '0')}:00Z</time></trkpt>`,
  ).join('');
  const gpx = `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Flat ride</name><trkseg>${points}</trkseg></trk></gpx>`;
  await page.goto('/');
  await pickSource(page, 'files');
  await page.getByTestId('file-input').setInputFiles({
    name: 'flat-ride.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(gpx),
  });
  await expect(page.getByTestId('activity-count')).toHaveText('1 activity on this device');
  await page.getByRole('button', { name: 'Choose activities' }).click();
  await pickPeriod(page);
  // One activity plays as a Highlight, without asking.
  await useActivities(page);
  await openSection(page, 'Overlay');
  await expect(page.getByRole('button', { name: /^Time: / })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Elevation chart', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add a chart' }).click();
  const add = page.getByRole('dialog', { name: 'Charts' });
  await expect(add.getByRole('button', { name: 'Speed chart' })).toBeVisible();
  await expect(add.getByRole('button', { name: 'Elevation chart' })).toHaveCount(0);
});

test('starts several activities without the elevation chart, which can be added', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await page.goto('/');
  await pickSource(page, 'files');
  const fixture = (name: string) =>
    new URL(`../../../packages/engine/tests/import/fixtures/${name}`, import.meta.url).pathname;
  await page
    .getByTestId('file-input')
    .setInputFiles([fixture('morning-ride.gpx'), fixture('trail-run.tcx')]);
  await expect(page.getByTestId('activity-count')).toHaveText('2 activities on this device');
  await page.getByRole('button', { name: 'Choose activities' }).click();
  await pickPeriod(page);
  await useActivities(page);
  await chooseStyle(page);
  await openSection(page, 'Overlay');

  // Several activities start without the chart; added, it is drawn.
  const chart = page.getByRole('button', { name: 'Elevation chart', exact: true });
  const onPicture = page.getByRole('button', { name: /^Elevation chart on the picture/ });
  await expect(page.getByRole('button', { name: /^Race time: / })).toBeVisible();
  await expect(chart).toHaveCount(0);
  await page.getByRole('button', { name: 'Add a chart' }).click();
  await page
    .getByRole('dialog', { name: 'Charts' })
    .getByRole('button', { name: 'Elevation chart' })
    .click();
  await expect(chart).toBeVisible();
  await expect(onPicture).toBeVisible();
  // Drawn with the climb's shape.
  await expect(onPicture.locator('path').first()).toHaveAttribute('d', /^M0,100 L/);
});
