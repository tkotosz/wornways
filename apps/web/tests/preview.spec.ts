import { expect, test } from '@playwright/test';
import { offlineMap } from './offline-map.ts';
import { pickSource } from './sources.ts';

test('plays a draft of the video in the preview, on Playback and Appearance', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await page.goto('/');
  await pickSource(page, 'demo');
  await expect(page.getByTestId('demo-count')).toHaveText('25 made-up activities');
  await page.getByRole('button', { name: 'Continue' }).click(); // to Activities
  await expect(page.getByTestId('chosen-count')).toContainText('25 of 25 activities selected');
  await page.getByRole('button', { name: 'Continue' }).click(); // to Playback

  // The still picture first; Play makes the draft and plays it in its place.
  const preview = page.getByTestId('preview');
  const play = preview.getByRole('button', { name: 'Play preview' });
  await expect(play).toBeVisible();
  await play.click();
  const video = preview.getByTestId('preview-video');
  await expect(video).toBeVisible({ timeout: 120_000 });
  // The whole video: the replay, then the end card.
  const seconds = await video.evaluate(
    (element: HTMLVideoElement) =>
      new Promise<number>((resolve) => {
        if (element.readyState >= 1) resolve(element.duration);
        else element.addEventListener('loadedmetadata', () => resolve(element.duration));
      }),
  );
  expect(seconds).toBeGreaterThan(30);
  expect(seconds).toBeLessThan(35);
  await expect(preview.getByTestId('draft-note')).toBeVisible();

  // The draft stays on the next step while the settings are the same.
  await page.getByRole('button', { name: 'Continue' }).click(); // to Appearance
  await expect(page.getByTestId('preview').getByTestId('preview-video')).toBeVisible();

  // A change goes back to the picture, until Play is pressed again.
  await page.getByRole('button', { name: '60 fps' }).click();
  await expect(page.getByTestId('preview').getByTestId('preview-video')).toHaveCount(0);
  await expect(
    page.getByTestId('preview').getByRole('button', { name: 'Play preview' }),
  ).toBeVisible();
});

test('a draft being made can be canceled', async ({ page, context }) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await page.goto('/');
  await pickSource(page, 'demo');
  await expect(page.getByTestId('demo-count')).toHaveText('25 made-up activities');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click(); // to Playback

  const preview = page.getByTestId('preview');
  await preview.getByRole('button', { name: 'Play preview' }).click();
  await expect(preview.getByRole('status')).toBeVisible();
  await preview.getByRole('button', { name: 'Cancel' }).click();
  await expect(preview.getByRole('status')).toHaveCount(0);
  await expect(preview.getByRole('button', { name: 'Play preview' })).toBeVisible();
  await expect(preview.getByTestId('preview-video')).toHaveCount(0);
});
