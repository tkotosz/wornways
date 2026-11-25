import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
import { pickSource } from './sources.ts';
import { expectSection, openSection } from './steps.ts';

const olderYear = new Date().getFullYear() - 1;
const csrf = 'strava-test-state';
const rideId = '9007199254740999';

test.use({ serviceWorkers: 'block' });

async function fakeStrava(
  page: Page,
  options: {
    pendingTrack?: Promise<void>;
    capacityReached?: boolean;
    otherActivities?: boolean;
  } = {},
) {
  let relay: WebSocketRoute | undefined;
  let exchanges = 0;
  let connections = 0;
  let removedRide = false;
  let expiredAccess = false;
  const grant = {
    expiresAt: Date.now() + 3_600_000,
    sessionId: 'test-session',
    cacheKey: 'test-cache-key',
  };
  const cookie = 'strava-test-session=1';
  const attributes = '; Path=/api/strava; Secure; HttpOnly; SameSite=Strict';
  const tracks: string[] = [];
  const calories: string[] = [];
  const periods: number[] = [];
  const directApiRequests: string[] = [];
  const disconnects: boolean[] = [];

  await page.context().routeWebSocket('**/api/strava/events', (socket) => {
    relay = socket;
    connections++;
  });

  await page.route('**/api/strava/oauth', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      exchanges++;
      return route.fulfill({ json: grant, headers: { 'set-cookie': cookie + attributes } });
    }
    const signedIn = (await request.headerValue('cookie'))?.includes(cookie);
    if (request.method() === 'DELETE') {
      const payload = request.postDataJSON() as { sessionId: string; disconnect: boolean };
      expect(payload).toEqual({
        sessionId: grant.sessionId,
        disconnect: expect.any(Boolean),
      });
      const { sessionId, disconnect } = payload;
      if (!signedIn || sessionId !== grant.sessionId)
        return route.fulfill({ status: disconnect ? 409 : 200, json: {} });
      disconnects.push(disconnect);
      return route.fulfill({
        json: {},
        headers: { 'set-cookie': cookie + attributes + '; Max-Age=0' },
      });
    }
    await route.fulfill({ json: { clientId: '123', ...(signedIn ? { session: grant } : {}) } });
  });

  await page.route('https://www.strava.com/oauth/authorize?*', async (route) => {
    if (options.capacityReached)
      return route.fulfill({ status: 403, body: 'Limit of connected athletes exceeded' });
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
    directApiRequests.push(route.request().url());
    await route.abort();
  });

  await page.context().route('**/api/strava/activities?*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const signedIn = (await request.headerValue('cookie'))?.includes(cookie);
    const sessionId = await request.headerValue('X-Wornways-Strava-Session');
    expect(await request.headerValue('authorization')).toBeNull();
    if (!signedIn || sessionId !== grant.sessionId || expiredAccess)
      return route.fulfill({ status: 401 });

    const caloriesOf = url.searchParams.get('calories');
    if (caloriesOf !== null) {
      calories.push(caloriesOf);
      return route.fulfill({ json: { calories: caloriesOf === rideId ? 652 : null } });
    }
    const id = url.searchParams.get('activity');
    if (id === null) {
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
              start_latlng: [47.496, 19.04],
              end_latlng: [47.5, 19.05],
            },
            {
              id: 18,
              name: 'Strava indoor ride',
              sport_type: 'Ride',
              start_date: olderYear + '-03-10T10:30:00Z',
              distance: 2000,
            },
            {
              id: 19,
              name: 'Strava out-and-back',
              sport_type: 'Ride',
              start_date: olderYear + '-03-07T10:30:00Z',
              distance: 4000,
              start_latlng: [47.495, 19.04],
              end_latlng: [47.48, 19.08],
            },
          ]
        : [];
      if (matches && options.otherActivities)
        for (let i = 0; i < 5; i++) {
          json.push({
            id: 20 + i,
            name: 'A ride elsewhere',
            sport_type: 'Ride',
            start_date: olderYear + '-03-20T10:30:00Z',
            distance: 4000,
            start_latlng: [46.5, 19.5],
            end_latlng: [46.5, 19.5],
          });
        }
      return route.fulfill({
        json: removedRide ? json.filter((row) => row.id_str !== rideId) : json,
      });
    }
    tracks.push(id);
    if (id !== rideId) return route.fulfill({ status: 404 });
    await options.pendingTrack;
    return route.fulfill({
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
  return {
    relay: () => relay,
    exchanges: () => exchanges,
    connections: () => connections,
    periods,
    tracks,
    calories,
    directApiRequests,
    disconnects,
    expireAccess: () => {
      expiredAccess = true;
    },
    removeRide: () => {
      removedRide = true;
    },
  };
}

async function connect(page: Page) {
  // From the list of sources (a first visit, or after "Change source"), Strava is picked first.
  const sources = page.getByTestId('sources');
  const link = page.getByRole('link', { name: 'Connect with Strava' });
  await expect(sources.or(link)).toBeVisible();
  if (await sources.isVisible()) await pickSource(page, 'strava');
  await link.click();
  await expect(page.getByRole('heading', { name: 'Choose your activities' })).toBeVisible();
}

test.describe('Strava on a phone', () => {
  test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

  test('makes a video from last year and keeps the saved file library after switching sources', async ({
    page,
  }) => {
    const mock = await fakeStrava(page);
    await page.goto('/');
    const fixture = new URL(
      '../../../packages/engine/tests/import/fixtures/strava-export.zip',
      import.meta.url,
    );
    await pickSource(page, 'files');
    await page.getByTestId('file-input').setInputFiles(fixture.pathname);
    await expect(page.getByTestId('activity-count')).toContainText('3 activities');
    await page.getByRole('button', { name: 'Change source' }).click();
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
    await expectSection(page, 'Frame');
    await expect(page.getByTestId('preview').getByRole('img')).toBeVisible();
    await page.getByRole('button', { name: 'Export →' }).click();
    await page.getByRole('button', { name: 'Make video' }).click();
    await expect(page.getByTestId('result')).toBeVisible({ timeout: 60_000 });
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.mp4$/);
    await expect(page.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Go to Source' }).click();
    await expect(page.getByTestId('chosen-source')).toHaveText('Strava');
    await page.getByRole('button', { name: 'Change source' }).click();
    await pickSource(page, 'files');
    // Choosing files keeps the Strava connection and its cached tracks for their two hours.
    await expect(page.getByTestId('result')).toHaveCount(0);
    await expect(page.getByTestId('activity-count')).toContainText('3 activities');
    expect(
      await page.evaluate(
        "caches.keys().then((names) => names.some((name) => name.startsWith('wornways-strava-')))",
      ),
    ).toBe(true);
    await page.reload();
    await expect(page.getByTestId('chosen')).toContainText('Balaton loop');
    await expect(page.getByTestId('chosen')).not.toContainText('Strava test ride');

    // Strava opens again without signing in, with the track it already had.
    await page.getByRole('button', { name: 'Change source' }).click();
    await expect(page.getByTestId('choose-strava')).toContainText('Connected until');
    await expect(page.getByTestId('choose-strava')).toContainText('1 downloaded');
    // Its screen shows what is kept here without asking Strava; Continue reads the list.
    const listed = mock.periods.length;
    await pickSource(page, 'strava');
    await expect(page.getByTestId('strava-source')).toContainText('Connected to Strava until');
    await expect(page.getByTestId('downloaded')).toContainText('Strava test ride');
    expect(mock.periods.length).toBe(listed);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('chosen')).toContainText('Strava test ride');
    expect(mock.periods.length).toBeGreaterThan(listed);
    expect(mock.exchanges()).toBe(1);
    expect(mock.tracks.filter((id) => id === rideId)).toHaveLength(1);
    expect(mock.periods.length).toBeGreaterThan(1);
    expect(mock.directApiRequests).toEqual([]);
    expect(mock.disconnects).toEqual([]);
  });
});

test('shows a temporary confirmation after disconnecting Strava', async ({ page }) => {
  const mock = await fakeStrava(page);
  await page.clock.install();
  await page.goto('/');
  await connect(page);
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await page.getByRole('button', { name: 'Disconnect Strava' }).click();

  const confirmation = 'Strava disconnected and temporary activities cleared.';
  const toast = page.locator('[aria-live="polite"]').getByText(confirmation, { exact: true });
  await expect(toast).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText(confirmation);
  await page.clock.fastForward(5000);
  await expect(toast).toBeHidden();
  expect(mock.disconnects).toEqual([true]);
});

test('clears the browser session when the Strava activity endpoint rejects access', async ({
  page,
}) => {
  const mock = await fakeStrava(page);
  await page.goto('/');
  await connect(page);
  await page.getByRole('button', { name: 'Last year', exact: true }).click();
  await expect(page.getByTestId('chosen')).toContainText('Strava test ride');
  mock.expireAccess();

  await page.getByRole('button', { name: 'This month', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Your Strava session cookie is missing or was replaced',
  );
  await expect(page.getByTestId('chosen')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Connect with Strava' })).toBeVisible();
  await expect.poll(() => mock.disconnects).toEqual([false]);
});

test('shows a slow track download in a dialog that can be canceled', async ({ page }) => {
  let releaseTrack: () => void = () => undefined;
  const pendingTrack = new Promise<void>((resolve) => {
    releaseTrack = resolve;
  });
  try {
    const mock = await fakeStrava(page, { pendingTrack });
    await page.goto('/');
    await connect(page);
    await page.getByRole('button', { name: 'Last year', exact: true }).click();
    await expect(page.getByTestId('chosen')).toContainText('Strava test ride');
    // Strava's list starts with nothing ticked.
    await page.getByRole('checkbox', { name: 'Strava test ride' }).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    const dialog = page.getByTestId('download');
    await expect(dialog).toContainText('Downloading tracks from Strava');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Download canceled.')).toBeVisible();

    // The track under way still arrives and is kept: going on again does not fetch it twice.
    releaseTrack();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expectSection(page, 'Frame');
    expect(mock.tracks.filter((id) => id === rideId)).toHaveLength(1);
  } finally {
    releaseTrack();
  }
});

test('fetches calories only for a video that shows them, and keeps them', async ({ page }) => {
  const mock = await fakeStrava(page);
  await page.goto('/');
  await connect(page);
  await page.getByRole('button', { name: 'Last year', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Strava test ride' }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await openSection(page, 'Overlay');
  await expectSection(page, 'Overlay');

  // Offered before any is known, and not asked for until picked.
  const caloriesChip = page
    .getByTestId('group-metrics')
    .getByRole('button', { name: /^(\d+ )?Calories$/ });
  await expect(caloriesChip).toHaveAttribute('aria-pressed', 'false');
  expect(mock.calories).toEqual([]);
  await caloriesChip.click();
  await expect(caloriesChip).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => mock.calories).toEqual([rideId]);

  // Kept: going back and forth, and after a reload, Strava is not asked again.
  await openSection(page, 'Playback');
  await openSection(page, 'Overlay');
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Strava test ride' })).toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();
  await openSection(page, 'Overlay');
  await expect(caloriesChip).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('img', { name: 'Preview: the last frame of the video' }),
  ).toBeVisible();
  expect(mock.calories).toEqual([rideId]);
});

test('shows the tracks downloaded while Strava is the source', async ({ page }) => {
  const mock = await fakeStrava(page);
  await page.goto('/');
  await connect(page);
  await page.getByRole('button', { name: 'Last year', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Strava test ride' }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expectSection(page, 'Frame');

  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(page.getByTestId('downloaded-count')).toHaveText(
    '1 activity downloaded to this device',
  );
  await expect(page.getByTestId('downloaded')).toContainText('Strava test ride');
  await page.getByRole('button', { name: 'Change source' }).click();
  await expect(page.getByTestId('choose-strava')).toContainText('1 downloaded');

  // A track cached before the list of kept tracks existed is listed once it is used again.
  await page.evaluate(`caches.keys().then(async (names) => {
    const cache = await caches.open(names.find((name) => name.startsWith('wornways-strava-')));
    await cache.delete('/wornways-strava-cache/downloaded');
  })`);
  await page.reload();
  await pickSource(page, 'strava');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Last year', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Strava test ride' })).toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expectSection(page, 'Frame');
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(page.getByTestId('downloaded')).toContainText('Strava test ride');
  expect(mock.tracks.filter((id) => id === rideId)).toHaveLength(1);
});

test('keeps Ride with GPS connected and listed while Strava is the source', async ({ page }) => {
  await fakeStrava(page);
  // Ride with GPS, connected in this browser, with one trip.
  await page.route('**/api/ridewithgps/session', (route) =>
    route.fulfill({ json: { connected: true } }),
  );
  await page.route('**/api/ridewithgps/trips?*', (route) =>
    route.fulfill({
      json: {
        trips: [
          {
            id: 7,
            name: 'Ride with GPS loop',
            departed_at: new Date().toISOString(),
            activity_type: 'cycling:road',
            distance: 1000,
            first_lat: 47.5,
            first_lng: 19.04,
            last_lat: 47.5,
            last_lng: 19.04,
            stationary: false,
            updated_at: 'v1',
          },
        ],
        pages: 1,
      },
    }),
  );
  await page.goto('/');
  await pickSource(page, 'rwgps');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('source')).toContainText('Ride with GPS');

  await page.getByRole('button', { name: 'Change source' }).click();
  await connect(page);
  await expect(page.getByTestId('source')).toContainText('Strava');

  // Strava is the source; Ride with GPS is still connected and listed with the others.
  await page.getByRole('button', { name: 'Change source' }).click();
  await expect(page.getByTestId('choose-strava')).toContainText('Connected until');
  await expect(page.getByTestId('choose-rwgps')).toContainText('Connected');

  // Chosen again, Strava stays the source after a reload.
  await pickSource(page, 'strava');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('source')).toContainText('Strava');
  await page.reload();
  await expect(page.getByTestId('source')).toContainText('Strava');

  await page.getByRole('button', { name: 'Change source' }).click();
  await pickSource(page, 'rwgps');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('source')).toContainText('Ride with GPS');
  await expect(page.getByTestId('chosen')).toContainText('Ride with GPS loop');
});

test('clears the session when Strava revokes access', async ({ page }) => {
  let releaseTrack: () => void = () => undefined;
  const pendingTrack = new Promise<void>((resolve) => {
    releaseTrack = resolve;
  });
  try {
    const mock = await fakeStrava(page, { pendingTrack });
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

test('reuses the selected track after a reload and socket interruption', async ({ page }) => {
  const mock = await fakeStrava(page);
  await page.goto('/');
  await connect(page);
  await page.getByRole('button', { name: 'Last year', exact: true }).click();
  const minimum = page.getByRole('textbox', { name: 'Minimum (km)' });
  const maximum = page.getByRole('textbox', { name: 'Maximum (km)' });
  await expect(page.getByTestId('chosen')).toContainText('Strava indoor ride');
  await maximum.fill('1.4');
  await minimum.fill('1,4');
  await expect(page.getByTestId('chosen-count')).toContainText('of 1 activity');
  await page.getByRole('checkbox', { name: 'Strava test ride' }).check();
  await page.getByRole('button', { name: '← Back', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Disconnect Strava' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('checkbox', { name: 'Strava test ride' })).toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expectSection(page, 'Frame');
  expect(mock.tracks.filter((id) => id === rideId)).toHaveLength(1);
  const savedDraft = () => page.evaluate(() => sessionStorage.getItem('wornways-strava-draft'));
  await expect.poll(savedDraft).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  expect(await savedDraft()).not.toContain(rideId);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Last year', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(minimum).toHaveValue('1,4');
  await expect(maximum).toHaveValue('1.4');
  await expect(page.getByTestId('chosen-count')).toContainText('1 of 1 activity');
  await expect(page.getByRole('checkbox', { name: 'Strava test ride' })).toBeChecked();
  expect(mock.exchanges()).toBe(1);
  await page.evaluate(`
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  `);
  await expect(page.getByRole('checkbox', { name: 'Strava test ride' })).toBeChecked();
  const connections = mock.connections();
  await mock.relay()!.close({ code: 1001 });
  await expect.poll(() => mock.connections()).toBeGreaterThan(connections);
  await expect(page.getByRole('checkbox', { name: 'Strava test ride' })).toBeChecked();
  expect(mock.exchanges()).toBe(1);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expectSection(page, 'Frame');
  expect(mock.tracks.filter((id) => id === rideId)).toHaveLength(1);
});

test('validates cached activities on reload and removes deleted tracks', async ({ page }) => {
  const mock = await fakeStrava(page);
  await page.goto('/');
  await connect(page);
  await page.getByRole('button', { name: 'Last year', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Strava test ride' }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expectSection(page, 'Frame');

  const cached = () =>
    page.evaluate(`
    caches.keys().then(async (names) => {
      const active = await caches.open(names.find((name) => name.startsWith('wornways-strava-')));
      const entries = await active.keys();
      return entries.some((entry) => entry.url.includes('/tracks/'));
    })
  `);
  expect(await cached()).toBe(true);
  mock.removeRide();
  await page.reload();
  await expect(page.getByTestId('chosen')).toContainText('Strava out-and-back');
  await expect(page.getByRole('checkbox', { name: 'Strava test ride' })).toHaveCount(0);
  expect(await cached()).toBe(false);
});

test('prunes expired Strava caches when Wornways starts', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sources')).toBeVisible();
  await page.evaluate(`caches.open('wornways-strava-1-expired').then(() => undefined)`);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate("caches.keys().then((names) => names.includes('wornways-strava-1-expired'))"),
    )
    .toBe(false);
});

test('filters Strava rides by both start and finish using activity summaries', async ({
  page,
  context,
}) => {
  await context.clearPermissions();
  const mock = await fakeStrava(page, { otherActivities: true });
  await page.goto('/');
  await connect(page);
  await page.getByRole('button', { name: 'Last year', exact: true }).click();
  const grid = page.getByTestId('chosen');
  await expect(grid).toContainText('Strava indoor ride');
  await page.getByRole('checkbox', { name: 'Starts near a place' }).check();
  await page.getByRole('textbox', { name: 'Start place' }).fill('47.496, 19.04');
  await expect(grid).toContainText('Strava test ride');
  await expect(grid).toContainText('Strava out-and-back');
  await expect(grid).not.toContainText('Strava indoor ride');
  await page.getByRole('checkbox', { name: 'Ends near a place' }).check();
  await page.getByRole('textbox', { name: 'End place' }).fill('47.5, 19.05');
  await expect(grid).toContainText('Strava test ride');
  await expect(grid).not.toContainText('Strava out-and-back');
  expect(mock.tracks).not.toContain(rideId);
});

test('offers the file workflow when Strava refuses a connection at capacity', async ({ page }) => {
  await fakeStrava(page, { capacityReached: true });
  await page.goto('/');
  await pickSource(page, 'strava');
  await expect(page.getByText('If Strava says its connection limit was reached')).toBeVisible();
  await expect(page.getByTestId('strava-unanswered')).toHaveCount(0);
  await page.getByRole('link', { name: 'Connect with Strava' }).click();
  await expect(page.getByText('Limit of connected athletes exceeded')).toBeVisible();
  // Strava never sends the person back: they come back on their own, and the page loads again.
  await page.goBack();
  await expect(page.getByTestId('strava-unanswered')).toContainText('Strava did not connect');
  await page.getByRole('button', { name: 'Use files instead' }).click();
  await expect(page.getByRole('button', { name: 'Choose files' })).toBeVisible();
  // The message is about that one sign-in: it is gone when Strava is chosen again.
  await page.reload();
  await page.getByRole('button', { name: 'Change source' }).click();
  await pickSource(page, 'strava');
  await expect(page.getByRole('link', { name: 'Connect with Strava' })).toBeVisible();
  await expect(page.getByTestId('strava-unanswered')).toHaveCount(0);
});

test('explains an unanswered Strava sign-in when the page comes back from the back-forward cache', async ({
  page,
}) => {
  await fakeStrava(page);
  await page.goto('/');
  await pickSource(page, 'strava');
  await expect(page.getByRole('link', { name: 'Connect with Strava' })).toBeVisible();
  // The browsers used in tests never keep pages for Back, so the restore is played here.
  await page.evaluate(`{
    sessionStorage.setItem('wornways-strava-state', 'left-on-strava');
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  }`);
  await expect(page.getByTestId('strava-unanswered')).toContainText('Strava did not connect');
  expect(await page.evaluate(() => sessionStorage.getItem('wornways-strava-state'))).toBeNull();
});
