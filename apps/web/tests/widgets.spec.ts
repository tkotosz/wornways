import { expect, test, type Page } from '@playwright/test';
import { offlineMap } from './offline-map.ts';
import { pickSource } from './sources.ts';
import { chooseStyle, openSection, pickPeriod } from './steps.ts';

/** Opens the demo's Design step on Overlay, where the widgets are arranged on the still. */
async function openOverlay(page: Page) {
  await page.goto('/');
  await pickSource(page, 'demo');
  await page.getByRole('button', { name: 'Continue' }).click(); // to Activities
  await pickPeriod(page);
  await page.getByRole('button', { name: 'Continue' }).click(); // to Design
  await chooseStyle(page, 'Recap');
  await openSection(page, 'Overlay');
  await expect(page.getByTestId('widget-0')).toBeVisible();
  await expect(page.getByText('Drawing preview')).toHaveCount(0);
}

/** A widget's outline on the still, by its place in the list. */
const outline = (page: Page, index: number) => page.getByTestId(`widget-${index}`);

/** Drags from a point by (dx, dy) pixels, in steps, as a pointer would. */
async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
}

/** The middle of an element's top strip, clear of a neighbor's outline below it. */
async function grip(page: Page, index: number) {
  const box = (await outline(page, index).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + 6 };
}

test('moves a widget on the still, snapping it to the middle, and draws it there', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await openOverlay(page);
  const still = page.getByRole('img', { name: 'Preview: the last frame of the video' });
  const before = await still.getAttribute('src');
  const frame = (await page.getByTestId('preview').locator('.frame').boundingBox())!;

  // The title, dragged to near the middle of the frame, snaps to it.
  const start = await grip(page, 0);
  const box = (await outline(page, 0).boundingBox())!;
  await drag(
    page,
    start,
    frame.x + frame.width / 2 - (box.x + box.width / 2) + 3,
    frame.y + frame.height / 2 - (box.y + box.height / 2) - 2,
  );
  await page.mouse.up();
  await expect(still).not.toHaveAttribute('src', before!);
  await expect
    .poll(async () => {
      const moved = (await outline(page, 0).boundingBox())!;
      return Math.abs(moved.y + moved.height / 2 - (frame.y + frame.height / 2)) < 1;
    })
    .toBe(true);
  const moved = (await outline(page, 0).boundingBox())!;
  expect(Math.abs(moved.x + moved.width / 2 - (frame.x + frame.width / 2))).toBeLessThan(1);
});

test('removes a widget with its × or by dropping it on the bin', async ({ page, context }) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await openOverlay(page);
  const rows = page.getByRole('button', { name: /^(Text|Date|Count|Distance):/ });
  await expect(rows).toHaveCount(4);

  // Picked, a widget shows its × .
  await outline(page, 0).click({ position: { x: 10, y: 6 } });
  await page.getByRole('button', { name: 'Remove text' }).click();
  await expect(rows).toHaveCount(3);
  await expect(page.getByRole('button', { name: /^Text: / })).toHaveCount(0);

  // Dropped on the bin at the bottom of the picture.
  await expect(outline(page, 0)).toBeVisible();
  const frame = (await page.getByTestId('preview').locator('.frame').boundingBox())!;
  const start = await grip(page, 0);
  await drag(
    page,
    start,
    frame.x + frame.width / 2 - start.x,
    frame.y + frame.height - 30 - start.y,
  );
  await page.mouse.up();
  await expect(rows).toHaveCount(2);
});

test('resizes a widget from its corner, and edits a text widget from a tap', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await openOverlay(page);
  await outline(page, 0).click({ position: { x: 10, y: 6 } });
  const handle = (await page.getByTestId('resize-0').boundingBox())!;
  await drag(page, { x: handle.x + 5, y: handle.y + 5 }, 40, 20);
  await page.mouse.up();

  // A tap on the picked text widget opens it: its text and its size.
  await expect(page.getByText('Drawing preview')).toHaveCount(0);
  await outline(page, 0).click({ position: { x: 10, y: 6 } });
  const sheet = page.getByRole('dialog', { name: 'Text' });
  await expect
    .poll(async () => Number(await sheet.getByRole('slider').inputValue()))
    .toBeGreaterThan(100);
  await sheet.getByRole('textbox', { name: 'Text' }).fill('Mallorca');
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: /^Text: / })).toHaveAccessibleName(
    'Text: Mallorca',
  );
});

test('moves, resizes and removes a picked widget with the keyboard', async ({ page, context }) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await openOverlay(page);
  await outline(page, 1).focus();
  await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('+');
  await page.getByRole('button', { name: /^Date: / }).click();
  await expect(page.getByRole('dialog', { name: 'Date' }).getByRole('slider')).not.toHaveValue(
    '100',
  );
  await page.keyboard.press('Escape');
  await outline(page, 1).focus();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('button', { name: /^Date: / })).toHaveCount(0);
});
