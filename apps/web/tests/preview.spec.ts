import { expect, test } from '@playwright/test';
import { offlineMap } from './offline-map.ts';
import { pickSource } from './sources.ts';
import { chooseStyle, openSection, pickPeriod } from './steps.ts';

test('plays a draft of the video in the preview, and edits on a still', async ({
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
  await expect(page.getByTestId('chosen-count')).toContainText('25 of 25 activities selected');
  await page.getByRole('button', { name: 'Continue' }).click(); // to Design
  await chooseStyle(page);

  // The still picture first; Play makes the draft and plays it in its place.
  const preview = page.getByTestId('preview');
  const play = preview.getByRole('button', { name: 'Play preview' });
  await expect(play).toBeVisible();
  await play.click();
  const video = preview.getByTestId('preview-video');
  await expect(video).toBeVisible({ timeout: 120_000 });
  // The whole video: the replay, then the end card.
  /** The parts of the video element the length is read from. */
  type Player = {
    readyState: number;
    duration: number;
    addEventListener(type: 'loadedmetadata', listener: () => void): void;
  };
  const seconds = await video.evaluate((element) => {
    const player = element as unknown as Player;
    return new Promise<number>((resolve) => {
      if (player.readyState >= 1) resolve(player.duration);
      else player.addEventListener('loadedmetadata', () => resolve(player.duration));
    });
  });
  expect(seconds).toBeGreaterThan(30);
  expect(seconds).toBeLessThan(35);
  // The caption tells the video's frame from the draft's, which is smaller and slower.
  await expect(preview.getByTestId('video-frame')).toContainText('Video: 1080 × 1920 · 30 fps');
  await expect(preview.getByTestId('draft-note')).toContainText(
    'Playing a quick draft at 270 × 480 and 15 fps',
  );

  // The draft stays in the next sections while the settings are the same.
  await openSection(page, 'Playback');
  await expect(preview.getByTestId('preview-video')).toBeVisible();
  await openSection(page, 'Map');
  await expect(preview.getByTestId('preview-video')).toBeVisible();

  // Overlay is arranged on a still: Play shows the draft already made, Edit goes back.
  await openSection(page, 'Overlay');
  await expect(preview.getByTestId('preview-video')).toHaveCount(0);
  await expect(
    preview.getByRole('img', { name: 'Preview: the last frame of the video' }),
  ).toBeVisible();
  await preview.getByRole('button', { name: 'Play preview' }).click();
  await expect(preview.getByTestId('preview-video')).toBeVisible();
  await expect(preview.getByRole('status')).toHaveCount(0);
  await preview.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(preview.getByTestId('preview-video')).toHaveCount(0);
  await expect(preview.getByRole('button', { name: 'Play preview' })).toBeVisible();

  // Ending: a still of how the video ends, the end card here.
  await openSection(page, 'Ending');
  await expect(
    preview.getByRole('img', { name: 'Preview: the ending of the video' }),
  ).toBeVisible();

  // A change goes back to the picture, until Play is pressed again.
  await openSection(page, 'Frame');
  await expect(preview.getByTestId('preview-video')).toBeVisible();
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
  await pickPeriod(page);
  await page.getByRole('button', { name: 'Continue' }).click(); // to Design
  await chooseStyle(page);

  const preview = page.getByTestId('preview');
  await preview.getByRole('button', { name: 'Play preview' }).click();
  await expect(preview.getByRole('status')).toBeVisible();
  await preview.getByRole('button', { name: 'Cancel' }).click();
  await expect(preview.getByRole('status')).toHaveCount(0);
  await expect(preview.getByRole('button', { name: 'Play preview' })).toBeVisible();
  await expect(preview.getByTestId('preview-video')).toHaveCount(0);
});
