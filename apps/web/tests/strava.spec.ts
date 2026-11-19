import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';

const olderYear = new Date().getFullYear() - 1;
const csrf = 'strava-test-state';
const rideId = '9007199254740999';

test.use({ serviceWorkers: 'block' });

async function fakeStrava(page: Page, pendingTrack?: Promise<void>) {
  let relay: WebSocketRoute | undefined;
  let exchanges = 0;
  const tracks: string[] = [];
  const periods: number[] = [];

  await page.context().routeWebSocket('**/api/strava/events', (socket) => {
    relay = socket;
  });

  await page.route('**/api/strava/oauth', async (route) => {
    if (route.request().method() === 'POST') {
      exchanges++;
      await route.fulfill({
        json: { token: 'test-token', expiresAt: Date.now() + 3_600_000, ticket: 'test-ticket' },
      });
    } else await route.fulfill({ json: { clientId: '123' } });
  });

  await page.route('https://www.strava.com/oauth/authorize?*', async (route) => {
    const request = new URL(route.request().url());
    const callback = new URL(request.searchParams.get('redirect_uri')!);
    callback.search = new URLSearchParams({
      code: 'test-code',
      scope: 'activity:read_all',
      state: request.searchParams.get('state')!,
    }).toString();
    await route.fulfill({ status: 302, headers: { Location: callback.href } });
  });

  await page.context().route('https://www.strava.com/api/v3/**', async (route) => {
    const url = new URL(route.request().url());
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/athlete/activities')) {
      const after = Number(url.searchParams.get('after'));
      periods.push(after);
      const march = Date.UTC(olderYear, 2, 15) / 1000;
      const matches =
        url.searchParams.get('page') === '1' &&
        after < march &&
        march < Number(url.searchParams.get('before'));
      const json = matches
        ? [
            {
              id: 9007199254741000,
              id_str: rideId,
              name: 'Strava test ride',
              sport_type: 'MountainBikeRide',
              start_date: olderYear + '-03-15T10:30:00Z',
              distance: 1400,
            },
            {
              id: 18,
              name: 'Strava indoor ride',
              sport_type: 'Ride',
              start_date: olderYear + '-03-10T10:30:00Z',
              distance: 2000,
            },
          ]
        : [];
      return route.fulfill({ json, headers });
    }
    const id = url.pathname.split('/').at(-2)!;
    tracks.push(id);
    if (id !== rideId) return route.fulfill({ status: 404, json: {}, headers });
    await pendingTrack;
    return route.fulfill({
      headers,
      json: {
        latlng: {
          data: [
            [47.496, 19.04],
            [47.497, 19.044],
            [47.5, 19.05],
          ],
        },
        time: { data: [0, 85, 300] },
        altitude: { data: [110, 115, 120] },
      },
    });
  });

  await page.context().route('https://tiles.openfreemap.org/**', async (route) => {
    if (route.request().url().endsWith('/planet'))
      return route.fulfill({
        json: { tiles: ['https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf'] },
      });
    return route.fulfill({ status: 204 });
  });
  return { relay: () => relay, exchanges: () => exchanges, periods, tracks };
}

async function connect(page: Page) {
  await page.getByRole('link', { name: 'Connect with Strava' }).click();
  await expect(page.getByRole('heading', { name: 'Choose your activities' })).toBeVisible();
}

test.describe('Strava on a phone', () => {
  test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

  test('makes a video from last year and keeps the saved file library after Done', async ({
    page,
  }) => {
    const mock = await fakeStrava(page);
    await page.goto('/');
    const fixture = new URL(
      '../../../packages/engine/tests/import/fixtures/strava-export.zip',
      import.meta.url,
    );
    await page.getByTestId('file-input').setInputFiles(fixture.pathname);
    await expect(page.getByTestId('activity-count')).toContainText('3 activities');
    await connect(page);
    await expect(page.getByRole('status')).toHaveText('No Strava activities in this period.');
    await page.getByRole('button', { name: 'Last year', exact: true }).click();
    const activities = page.getByTestId('chosen');
    await expect(activities).toContainText('Strava test ride');
    await expect(activities).toContainText('Strava indoor ride');
    await expect(activities).not.toContainText('Balaton loop');
    await expect(activities.getByRole('link', { name: 'View on Strava' }).first()).toHaveAttribute(
      'href',
      'https://www.strava.com/activities/' + rideId,
    );
    await expect.poll(() => mock.tracks).toContain(rideId);
    await page.getByRole('checkbox', { name: 'Strava indoor ride' }).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('status')).toContainText('no usable GPS track');
    await page.getByRole('checkbox', { name: 'Strava test ride' }).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'How should your routes play?' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('preview').getByRole('img')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Make video' }).click();
    await expect(page.getByTestId('result')).toBeVisible({ timeout: 60_000 });
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.mp4$/);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByTestId('result')).toHaveCount(0);
    await expect(page.getByTestId('activity-count')).toContainText('3 activities');
    await page.reload();
    await expect(page.getByTestId('chosen')).toContainText('Balaton loop');
    await expect(page.getByTestId('chosen')).not.toContainText('Strava test ride');
    expect(mock.tracks.filter((id) => id === rideId)).toHaveLength(1);
    expect(mock.periods.length).toBeGreaterThan(1);
  });
});

test('clears the session when Strava revokes access', async ({ page }) => {
  let releaseTrack: () => void = () => undefined;
  const pendingTrack = new Promise<void>((resolve) => {
    releaseTrack = resolve;
  });
  try {
    const mock = await fakeStrava(page, pendingTrack);
    await page.goto('/');
    await connect(page);
    await page.getByRole('button', { name: 'Last year', exact: true }).click();
    await expect(page.getByTestId('chosen')).toContainText('Strava test ride');
    await expect.poll(() => mock.tracks).toContain(rideId);
    mock.relay()!.send('revoked');
    await expect(page.getByRole('alert')).toContainText('Temporary activities were cleared');
    releaseTrack();
    await expect(page.getByTestId('chosen')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Connect with Strava' })).toBeVisible();
  } finally {
    releaseTrack();
  }
});

test('rejects a Strava callback with mismatched state before exchanging its code', async ({
  page,
}) => {
  const mock = await fakeStrava(page);
  await page.addInitScript((state) => sessionStorage.setItem('wornways-strava-state', state), csrf);
  await page.goto('/?state=wrong&code=test-code&scope=activity%3Aread_all');
  await expect(page.getByRole('alert')).toContainText('sign-in expired');
  expect(mock.exchanges()).toBe(0);
  expect(new URL(page.url()).search).toBe('');
});
