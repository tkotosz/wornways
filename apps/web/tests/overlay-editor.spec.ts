import { expect, test, type Page } from '@playwright/test';
import { offlineMap } from './offline-map.ts';
import { pickSource } from './sources.ts';
import { openSection } from './steps.ts';

/** Opens the demo's Design step on Overlay, where the title is arranged on the still. */
async function openOverlay(page: Page) {
  await page.goto('/');
  await pickSource(page, 'demo');
  await page.getByRole('button', { name: 'Continue' }).click(); // to Activities
  await page.getByRole('button', { name: 'Continue' }).click(); // to Design
  await openSection(page, 'Overlay');
  await expect(page.getByTestId('edit-title')).toBeVisible();
}

/** Drags a block's middle by (dx, dy) pixels, in steps, as a pointer would. */
async function drag(page: Page, testId: string, dx: number, dy: number) {
  const box = (await page.getByTestId(testId).boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

test('moves the title on the still, snaps it to the named positions and resizes it', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await openOverlay(page);
  const title = page.getByTestId('group-title');
  const still = page.getByRole('img', { name: 'Preview: the last frame of the video' });
  const position = title.getByText(/^(Top middle|Placed on the picture|Middle left)$/);
  await expect(position).toHaveText('Top middle');

  // Dragged down into the picture, it is placed there, and the still is drawn again.
  const before = await still.getAttribute('src');
  const top = (await page.getByTestId('edit-title').boundingBox())!.y;
  await drag(page, 'edit-title', -20, 150);
  await expect(position).toHaveText('Placed on the picture');
  await expect(still).not.toHaveAttribute('src', before!);
  await expect
    .poll(async () => (await page.getByTestId('edit-title').boundingBox())!.y)
    .toBeGreaterThan(top + 100);

  // Near the left margin and the middle of the frame, it snaps to the named position.
  const frame = (await page.getByTestId('preview').locator('.frame').boundingBox())!;
  const box = (await page.getByTestId('edit-title').boundingBox())!;
  await drag(
    page,
    'edit-title',
    // The outline reaches 4 px past the block on each side.
    frame.x + frame.width * 0.07 - (box.x + 4) + 2,
    frame.y + frame.height * 0.5 - (box.y + box.height / 2) + 3,
  );
  await expect(position).toHaveText('Middle left');

  // The corner handle resizes it, in steps of 5%.
  const size = title.getByRole('slider', { name: 'Size' });
  await expect(size).toHaveValue('100');
  const handle = (await page.getByTestId('resize-title').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 30, handle.y + 30, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Number(await size.inputValue())).toBeGreaterThan(100);
  expect(Number(await size.inputValue()) % 5).toBe(0);
});

test('moves and resizes the metrics card with the keyboard', async ({ page, context }) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await openOverlay(page);
  const metrics = page.getByTestId('group-metrics');
  const card = page.getByRole('button', { name: /^Metrics on the picture/ });

  await card.focus();
  await page.keyboard.press('Shift+ArrowUp');
  await expect(metrics.getByText('Placed on the picture')).toBeVisible();
  await page.keyboard.press('+');
  await expect(metrics.getByRole('slider', { name: 'Size' })).toHaveValue('110');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });

  test('picking a block on the still brings its settings into view', async ({ page, context }) => {
    page.setDefaultTimeout(15_000);
    await offlineMap(context);
    await openOverlay(page);
    const metricsSize = page.getByRole('button', { name: /^Size: / }).last();
    await expect(metricsSize).not.toBeInViewport();
    await page.getByTestId('edit-metrics').dispatchEvent('pointerdown', {
      button: 0,
      pointerId: 1,
      isPrimary: true,
    });
    await expect(page.getByRole('heading', { name: 'Metrics' })).toBeInViewport();
  });
});
