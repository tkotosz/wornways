import { expect, test } from '@playwright/test';
import { offlineMap } from './offline-map.ts';
import { pickSource } from './sources.ts';

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
  await page.getByRole('button', { name: 'Continue' }).click(); // to Playback
  await page.getByRole('button', { name: 'Continue' }).click(); // to Appearance

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
  await page.goto('/');
  await pickSource(page, 'demo');
  await expect(page.getByTestId('demo-count')).toHaveText('25 made-up activities');
  await page.getByRole('button', { name: 'Continue' }).click();
  // The demo has no elevation; one activity of it still gets no profile to set.
  await page.getByRole('checkbox', { name: 'Select all shown' }).click();
  await page.getByTestId('chosen').getByText('Easy run').click();
  await page.getByRole('button', { name: 'Continue' }).click(); // to Playback
  await page.getByRole('button', { name: 'Continue' }).click(); // to Appearance
  await expect(page.getByTestId('group-metrics')).toBeVisible();
  await expect(page.getByTestId('group-elevation')).toHaveCount(0);
});
