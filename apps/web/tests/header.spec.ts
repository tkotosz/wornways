import { expect, test } from '@playwright/test';

test('shows the version under the name', async ({ page }) => {
  await page.goto('/');
  // A release tag, or branch@commit with -dirty for changes not committed yet.
  await expect(page.getByTestId('version')).toHaveText(
    /^(v\d+\.\d+\.\d+|([^@\s]+@)?[0-9a-f]{7,}(-dirty)?)$/,
  );
});
