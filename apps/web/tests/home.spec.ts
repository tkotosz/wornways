import { expect, test } from '@playwright/test';
import { pickSource } from './sources.ts';

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });

  test('shows the header on the list of sources only, and the step bar after it', async ({
    page,
  }) => {
    await page.goto('/');
    const about = page.getByRole('button', { name: 'About' });
    // The list of sources is the home screen: the header, and no step bar.
    await expect(about).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Step 1 of 4/ })).toHaveCount(0);

    // A source's screen has the step bar in the header's place; its way back is the list.
    await pickSource(page, 'demo');
    await expect(page.getByRole('heading', { name: 'Step 1 of 4: Source' })).toBeVisible();
    await expect(about).toBeHidden();
    await page.getByRole('button', { name: 'Back to Sources' }).click();
    await expect(page.getByTestId('sources')).toBeVisible();
    await expect(about).toBeVisible();
  });
});

test('keeps the header on wide screens, without the step pills on the list of sources', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'About' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Steps' })).toHaveCount(0);
  await pickSource(page, 'demo');
  await expect(page.getByRole('button', { name: 'About' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Steps' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to Sources' })).toBeVisible();
});
