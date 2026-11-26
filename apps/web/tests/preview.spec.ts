import { expect, test } from '@playwright/test';
import { offlineMap } from './offline-map.ts';
import {
  chooseStyle,
  openDemo,
  openSection,
  pickPeriod,
  pickSource,
  useActivities,
} from './popups.ts';

test('plays a draft of the video in the preview, and edits on a still', async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(15_000);
  await offlineMap(context);
  await page.goto('/');
  await pickSource(page, 'demo');
  await pickPeriod(page);
  await expect(page.getByTestId('chosen-count')).toContainText('25 of 25 activities selected');
  await useActivities(page);
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
  // A line under it says the draft is smaller and slower than the video.
  await expect(preview.getByTestId('draft-note')).toContainText(
    'Playing a quick draft at 270 × 480 and 15 fps',
  );

  // The draft stays in the next sections while the settings are the same.
  await openSection(page, 'Playback');
  await expect(preview.getByTestId('preview-video')).toBeVisible();
  await openSection(page, 'Map');
  await expect(preview.getByTestId('preview-video')).toBeVisible();

  // Overlay is arranged on a still; Play shows the draft already made, Edit goes back.
  await openSection(page, 'Overlay');
  await expect(preview.getByTestId('preview-video')).toHaveCount(0);
  await expect(
    preview.getByRole('img', { name: 'Preview: the last frame of the video' }),
  ).toBeVisible();
  await preview.getByRole('button', { name: 'Play preview' }).click();
  await expect(preview.getByTestId('preview-video')).toBeVisible();
  await preview.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(preview.getByTestId('preview-video')).toHaveCount(0);

  // Ending also opens on a still: Play shows the draft already made, from shortly before the
  // replay ends, and Edit goes back.
  await openSection(page, 'Ending');
  await preview.getByRole('button', { name: 'Play preview' }).click();
  await expect(preview.getByTestId('preview-video')).toBeVisible();
  await expect
    .poll(() =>
      preview
        .getByTestId('preview-video')
        .evaluate((element) => (element as unknown as { currentTime: number }).currentTime),
    )
    .toBeGreaterThan(seconds - 6);
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
  await openDemo(page);

  const preview = page.getByTestId('preview');
  await preview.getByRole('button', { name: 'Play preview' }).click();
  await expect(preview.getByRole('status')).toBeVisible();
  await preview.getByRole('button', { name: 'Cancel' }).click();
  await expect(preview.getByRole('status')).toHaveCount(0);
  await expect(preview.getByRole('button', { name: 'Play preview' })).toBeVisible();
  await expect(preview.getByTestId('preview-video')).toHaveCount(0);
});
