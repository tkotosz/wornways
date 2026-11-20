import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const activity = new URL(
  '../../../packages/engine/tests/import/fixtures/trail-run.tcx',
  import.meta.url,
).pathname;

/** Close real IndexedDB connections inside the worker before the selected transactions. */
async function closeConnections(
  page: Page,
  mode: 'readonly' | 'readwrite',
  times: number,
): Promise<void> {
  await page.route('**/assets/worker-*.js', async (route) => {
    const response = await route.fetch();
    const script = `{
      let remaining = ${times};
      const transaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        if (args[1] === ${JSON.stringify(mode)} && remaining > 0) {
          remaining--;
          this.close();
        }
        return transaction.apply(this, args);
      };
    }`;
    await route.fulfill({ response, body: `${script}\n${await response.text()}` });
  });
}

test('saves the import after the database connection closes', async ({ page }) => {
  await closeConnections(page, 'readwrite', 1);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose files' })).toBeVisible();
  await page.getByTestId('file-input').setInputFiles(activity);
  await expect(page.getByTestId('import-report')).toContainText('1 activity added');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Choose your activities' })).toBeVisible();
  await page.getByRole('button', { name: /^(Go to )?Source$/ }).click();
  await expect(page.getByTestId('activity-count')).toHaveText('1 activity on this device');
});

test('can retry loading the library after its database keeps closing', async ({ page }) => {
  await closeConnections(page, 'readonly', 2);
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('lost access to the activity library');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('button', { name: 'Choose files' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('preserves separate activities imported with the same name in two tabs', async ({
  page,
  context,
}) => {
  const second = await context.newPage();
  const ride = new URL(
    '../../../packages/engine/tests/import/fixtures/morning-ride.gpx',
    import.meta.url,
  );
  const firstFile = {
    name: 'workout.tcx',
    mimeType: 'application/xml',
    buffer: await readFile(activity),
  };
  const secondFile = {
    name: 'workout.gpx',
    mimeType: 'application/xml',
    buffer: await readFile(ride),
  };
  await Promise.all([page.goto('/'), second.goto('/')]);
  await Promise.all([
    page.getByTestId('file-input').setInputFiles(firstFile),
    second.getByTestId('file-input').setInputFiles(secondFile),
  ]);
  await Promise.all(
    [page, second].map((tab) =>
      expect(tab.getByTestId('import-report')).toContainText('1 activity added'),
    ),
  );
  await page.reload();
  await expect(page.getByTestId('chosen-count')).toContainText('2 activities');
});
