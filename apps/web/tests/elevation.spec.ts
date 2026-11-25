import { expect, test } from '@playwright/test';
import { offlineMap } from './offline-map.ts';
import { pickSource } from './sources.ts';
import { openSection, pickPeriod } from './steps.ts';

test('offers the elevation profile for a single activity with elevation', async ({
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
  await page.getByRole('button', { name: 'Continue' }).click(); // to Activities
  await pickPeriod(page);
  await page.getByRole('button', { name: 'Continue' }).click(); // to Design
  await openSection(page, 'Overlay');

  const panel = page.getByTestId('group-elevation');
  const profile = panel.getByRole('switch', { name: 'Elevation profile' });
  await expect(profile).toBeChecked();
  // Switched off, the preview is drawn again without it.
  const picture = page.getByTestId('preview').getByRole('img');
  await expect(picture).toBeVisible();
  const before = await picture.getAttribute('src');
  await profile.click();
  await expect(profile).not.toBeChecked();
  await expect(picture).not.toHaveAttribute('src', before!);
});

test('leaves the elevation profile out where there is no elevation', async ({ page, context }) => {
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
  await page.getByRole('button', { name: 'Continue' }).click(); // to Activities
  await pickPeriod(page);
  await page.getByRole('button', { name: 'Continue' }).click(); // to Design
  await openSection(page, 'Overlay');
  await expect(page.getByTestId('group-metrics')).toBeVisible();
  await expect(page.getByTestId('group-elevation')).toHaveCount(0);
});

test('offers the elevation profile for several activities, off until switched on', async ({
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
  await page.getByRole('button', { name: 'Continue' }).click(); // to Activities
  await pickPeriod(page);
  await page.getByRole('button', { name: 'Continue' }).click(); // to Design
  await openSection(page, 'Overlay');

  const profile = page
    .getByTestId('group-elevation')
    .getByRole('switch', { name: 'Elevation profile' });
  await expect(profile).not.toBeChecked();
  const picture = page.getByTestId('preview').getByRole('img');
  await expect(picture).toBeVisible();
  await expect(page.getByText('Drawing preview')).toHaveCount(0);
  const before = await picture.getAttribute('src');
  await profile.click();
  await expect(profile).toBeChecked();
  await expect(picture).not.toHaveAttribute('src', before!);
});
