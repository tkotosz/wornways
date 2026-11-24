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

test('picks the totals card values and their order', async ({ page, context }) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await page.goto('/');
  await pickSource(page, 'demo');
  await page.getByRole('button', { name: 'Continue' }).click(); // to Activities
  await page.getByRole('button', { name: 'Continue' }).click(); // to Playback
  await page
    .getByRole('radiogroup', { name: 'Preset' })
    .getByRole('radio', { name: /Recap/ })
    .click();
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();

  const group = page.getByTestId('group-totals');
  const chip = (name: string) => group.getByRole('button', { name: new RegExp(`${name}$`) });
  const picked = () =>
    group.locator('.chip[aria-pressed="true"]').evaluateAll((chips) =>
      chips
        .map(
          (c) =>
            [
              Number(c.querySelector('.order')?.textContent),
              c.textContent!.replace(/^\s*\d+\s*/, '').trim(),
            ] as const,
        )
        .sort((a, b) => a[0] - b[0])
        .map(([, name]) => name),
    );

  // Automatic: all four, in the usual order.
  await expect.poll(picked).toEqual(['Activities', 'Kilometers', 'Hours moving', 'Meters climbed']);
  await expect(group.getByRole('button', { name: 'Use automatic totals' })).toHaveCount(0);

  // Unpicking renumbers the rest; picking again puts it last.
  await chip('Activities').click();
  await expect.poll(picked).toEqual(['Kilometers', 'Hours moving', 'Meters climbed']);
  await chip('Activities').click();
  await expect.poll(picked).toEqual(['Kilometers', 'Hours moving', 'Meters climbed', 'Activities']);
  // The last one picked cannot be unpicked.
  for (const name of ['Kilometers', 'Hours moving', 'Meters climbed']) await chip(name).click();
  await expect.poll(picked).toEqual(['Activities']);
  await chip('Activities').click();
  await expect.poll(picked).toEqual(['Activities']);

  // Every other total is offered too (the demo activities have heights).
  for (const name of [
    'Hours in total',
    'Meters descended',
    'Highest point',
    'Average pace',
    'Top speed',
    'Dates',
    'Days out',
    'Longest activity',
  ])
    await expect(chip(name)).toHaveAttribute('aria-pressed', 'false');
  // The pace and the dates are offered too, after the usual four.
  await chip('Dates').click();
  await chip('Average pace').click();
  await expect.poll(picked).toEqual(['Activities', 'Dates', 'Average pace']);

  // Back to automatic.
  await group.getByRole('button', { name: 'Use automatic totals' }).click();
  await expect.poll(picked).toEqual(['Activities', 'Kilometers', 'Hours moving', 'Meters climbed']);

  // Switched off, the card's values hide.
  await group.getByRole('switch', { name: 'Totals card' }).click();
  await expect(chip('Activities')).toHaveCount(0);
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
