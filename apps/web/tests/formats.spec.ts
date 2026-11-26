import { expect, test } from '@playwright/test';
import { offlineMap } from './offline-map.ts';
import { openDemo, openSection } from './popups.ts';

test('writes a time and a date as picked, over the replay and on the totals card', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await openDemo(page, 'Multiday trip');
  await openSection(page, 'Overlay');

  // The trip's moving time: h:mm:ss until another format is picked from its chip.
  /** A widget on the picture, by its name. */
  const onPicture = (name: string) =>
    page.getByRole('button', { name: new RegExp(`^${name} on the picture`) });
  const moving = onPicture('Total moving time');
  await expect(moving).toContainText(/\d+:\d\d:\d\d/);
  await moving.click();
  await page.getByRole('button', { name: 'Format: h:mm:ss' }).click();
  const sheet = page.getByRole('dialog', { name: 'Total moving time: format' });
  await expect(sheet.getByRole('radio', { name: /^Hours/ })).toContainText(/\d+ h$/);
  await sheet.getByRole('radio', { name: /^Days/ }).click();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(moving).toContainText(/\d+\.\d days/);
  await expect(page.getByRole('button', { name: 'Format: Days' })).toBeVisible();
  await page.getByRole('button', { name: '✓ Done' }).click();

  // The date: with its weekday.
  const date = onPicture('Date');
  await expect(date).toContainText(/^\d+ \w+ 2026/);
  await date.click();
  await page.getByRole('button', { name: 'Format: Day month year' }).click();
  await page
    .getByRole('dialog', { name: 'Date: format' })
    .getByRole('radio', { name: /^With weekday/ })
    .click();
  await page
    .getByRole('dialog', { name: 'Date: format' })
    .getByRole('button', { name: 'Done' })
    .click();
  await expect(date).toContainText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ [A-Z][a-z]+(?! \d)/);
  await page.getByRole('button', { name: '✓ Done' }).click();

  // On the totals card a time is in hours until picked.
  await openSection(page, 'Ending');
  await page.getByRole('switch', { name: 'Totals card' }).check();
  const onCard = moving;
  await expect(onCard.locator('.value')).toHaveText(/^\d+ h$/);
  await onCard.click();
  await page.getByRole('button', { name: 'Format: Hours' }).click();
  const card = page.getByRole('dialog', { name: 'Total moving time: format' });
  await expect(card.getByRole('radio', { name: /^Days/ })).toContainText(/\d\.\d days$/);
  await card.getByRole('radio', { name: /^h:mm / }).click();
  await card.getByRole('button', { name: 'Done' }).click();
  await expect(onCard.locator('.value')).toHaveText(/^\d+:\d\d$/);
});

test('tells distances and heights in miles and feet when Imperial is picked', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await openDemo(page, 'Recap');
  await openSection(page, 'Overlay');
  const onPicture = (name: string) =>
    page.getByRole('button', { name: new RegExp(`^${name} on the picture`) });
  const distance = onPicture('Total distance');
  const climb = onPicture('Total climb');
  await expect(distance).toContainText('1,147 km');
  await expect(climb).toContainText('15,423 m');

  // Wide, the units sit beside the picture; on a phone a chip opens them.
  const units = page.getByRole('group', { name: 'Units' });
  await units.getByRole('button', { name: 'Imperial' }).click();
  await expect(distance).toContainText('713 mi');
  await expect(climb).toContainText('50,600 ft');

  // The totals card follows.
  await openSection(page, 'Ending');
  await expect(distance.locator('.value')).toHaveText('713 mi');
  await expect(climb.locator('.value')).toHaveText('50,600 ft');

  // A value's unit can be left out, the number alone, here or over the replay.
  await distance.click();
  await page.getByRole('button', { name: 'Unit: Shown' }).click();
  const unit = page.getByRole('dialog', { name: 'Total distance: unit' });
  await expect(unit.getByRole('radio', { name: /^Off/ })).toContainText('713');
  await unit.getByRole('radio', { name: /^Off/ }).click();
  await unit.getByRole('button', { name: 'Done' }).click();
  await expect(distance.locator('.value')).toHaveText('713');
  await expect(page.getByRole('button', { name: 'Unit: Off' })).toBeVisible();
  // A count has no unit to leave out.
  await page.getByRole('button', { name: '✓ Done' }).click();
  await onPicture('Total activities').click();
  await expect(page.getByRole('button', { name: /^Unit: / })).toHaveCount(0);
});
