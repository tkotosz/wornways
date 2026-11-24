import { expect, test } from '@playwright/test';
import { offlineMap } from './offline-map.ts';
import { pickSource } from './sources.ts';

test('turns the totals card on for Recap, and leaves the switch to the person', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await page.goto('/');
  await pickSource(page, 'demo');
  await expect(page.getByTestId('demo-count')).toHaveText('25 made-up activities');
  await page.getByRole('button', { name: 'Continue' }).click(); // to Activities
  await page.getByRole('button', { name: 'Continue' }).click(); // to Playback

  const presets = page.getByRole('radiogroup', { name: 'Preset' });
  const totals = page.getByTestId('group-totals').getByRole('switch', { name: 'Totals card' });
  /** Goes to Appearance, where the switch is, and back. */
  const toAppearance = () => page.getByRole('button', { name: 'Appearance', exact: true }).click();
  const toPlayback = () => page.getByRole('button', { name: 'Playback', exact: true }).click();

  // All at once, the first preset: off.
  await toAppearance();
  await expect(totals).not.toBeChecked();

  // Recap: on.
  await toPlayback();
  await presets.getByRole('radio', { name: /Recap/ }).click();
  await toAppearance();
  await expect(totals).toBeChecked();

  // A change of length makes it Custom, which starts from Recap's values: still on.
  await toPlayback();
  await page.getByRole('spinbutton', { name: 'Exact video length in seconds' }).fill('20');
  await page.getByRole('spinbutton', { name: 'Exact video length in seconds' }).press('Enter');
  await expect(page.getByTestId('replay-summary')).toContainText('Custom playback');
  await toAppearance();
  await expect(totals).toBeChecked();

  // Switched off under Recap, it stays off.
  await toPlayback();
  await presets.getByRole('radio', { name: /Recap/ }).click();
  await toAppearance();
  await totals.click();
  await expect(totals).not.toBeChecked();
  await toPlayback();
  await toAppearance();
  await expect(totals).not.toBeChecked();
});

test('offers the totals card for several activities only', async ({ page, context }) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await page.goto('/');
  await pickSource(page, 'demo');
  await expect(page.getByTestId('demo-count')).toHaveText('25 made-up activities');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('checkbox', { name: 'Select all shown' }).click();
  await page.getByTestId('chosen').getByText('Easy run').click();
  await page.getByRole('button', { name: 'Continue' }).click(); // to Playback
  await page.getByRole('button', { name: 'Continue' }).click(); // to Appearance
  await expect(page.getByTestId('group-metrics')).toBeVisible();
  await expect(page.getByTestId('group-totals')).toHaveCount(0);
});
