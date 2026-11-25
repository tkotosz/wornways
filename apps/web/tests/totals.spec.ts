import { expect, test } from '@playwright/test';
import { offlineMap } from './offline-map.ts';
import { pickSource } from './sources.ts';
import { chooseStyle, openSection, pickPeriod } from './steps.ts';

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
  await pickPeriod(page);
  await page.getByRole('button', { name: 'Continue' }).click(); // to Design
  await chooseStyle(page);

  const presets = page.getByRole('radiogroup', { name: 'Preset' });
  const totals = page.getByTestId('group-totals').getByRole('switch', { name: 'Totals card' });
  /** Goes to Ending, where the switch is, and back to Playback. */
  const toEnding = () => openSection(page, 'Ending');
  const toPlayback = () => openSection(page, 'Playback');

  // All at once, the first preset: off.
  await toEnding();
  await expect(totals).not.toBeChecked();

  // Recap: on.
  await toPlayback();
  await presets.getByRole('radio', { name: /Recap/ }).click();
  await toEnding();
  await expect(totals).toBeChecked();

  // A change of length makes it Custom, which starts from Recap's values: still on.
  await toPlayback();
  await page.getByRole('spinbutton', { name: 'Exact video length in seconds' }).fill('20');
  await page.getByRole('spinbutton', { name: 'Exact video length in seconds' }).press('Enter');
  await expect(page.getByTestId('replay-summary')).toContainText('Custom playback');
  await toEnding();
  await expect(totals).toBeChecked();

  // Switched off under Recap, it stays off.
  await toPlayback();
  await presets.getByRole('radio', { name: /Recap/ }).click();
  await toEnding();
  await totals.click();
  await expect(totals).not.toBeChecked();
  await toPlayback();
  await toEnding();
  await expect(totals).not.toBeChecked();
});

test('arranges the totals card as widgets: the title and the totals, then more', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await page.goto('/');
  await pickSource(page, 'demo');
  await page.getByRole('button', { name: 'Continue' }).click(); // to Activities
  await pickPeriod(page);
  await page.getByRole('button', { name: 'Continue' }).click(); // to Design
  await chooseStyle(page, 'Recap');
  await openSection(page, 'Ending');

  // The card starts with the title over activities, kilometers, hours moving and meters
  // climbed (the demo activities have heights), drawn by the page over the bare card.
  const onCard = page.locator('[data-widget]');
  await expect(onCard).toHaveCount(5);
  await expect(page.getByTestId('widget-0')).toContainText('2026');
  await expect(page.getByTestId('widget-1')).toContainText('25');
  await expect(page.getByTestId('widget-1')).toContainText('activities');
  await expect(page.getByTestId('widget-4')).toContainText('m climbed');

  // Its tools add a text or a total; there is no chart and no watermark on the card.
  await expect(page.getByRole('button', { name: 'Show the elevation chart' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show the watermark' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add a value' }).click();
  const totals = page.getByRole('dialog', { name: 'Values' });
  await expect(totals.getByRole('button', { name: / Distance$/ })).toBeDisabled();
  await totals.getByRole('button', { name: / Days out$/ }).click();
  await expect(onCard).toHaveCount(6);
  await expect(page.getByTestId('widget-5')).toContainText('days out');
  await page.getByRole('button', { name: 'Add a text' }).click();
  await page.keyboard.type('What a spring');
  await page.keyboard.press('Enter');
  await expect(onCard).toHaveCount(7);
  await expect(page.getByTestId('widget-6')).toContainText('What a spring');

  // A picked one moves and goes with the keyboard, as over the replay.
  const before = (await page.getByTestId('widget-1').boundingBox())!;
  await page.getByTestId('widget-1').focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await page.getByTestId('widget-1').boundingBox())!.x)
    .toBeGreaterThan(before.x);
  await page.keyboard.press('Delete');
  await expect(onCard).toHaveCount(6);
  await expect(page.getByTestId('widget-1')).not.toContainText('activities');

  // Switched off, the card and its widgets go.
  await page.getByTestId('group-totals').getByRole('switch', { name: 'Totals card' }).click();
  await expect(onCard).toHaveCount(0);
});

test('offers the totals card for several activities only', async ({ page, context }) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await page.goto('/');
  await pickSource(page, 'demo');
  await expect(page.getByTestId('demo-count')).toHaveText('25 made-up activities');
  await page.getByRole('button', { name: 'Continue' }).click();
  await pickPeriod(page);
  await page.getByRole('checkbox', { name: 'Select all shown' }).click();
  await page.getByTestId('chosen').getByText('Easy run').click();
  await page.getByRole('button', { name: 'Continue' }).click(); // to Design
  await chooseStyle(page);
  await openSection(page, 'Ending');
  await expect(page.getByTestId('group-end-card')).toBeVisible();
  await expect(page.getByTestId('group-totals')).toHaveCount(0);
});
