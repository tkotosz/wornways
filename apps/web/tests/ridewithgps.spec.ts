import { expect, test, type Page } from '@playwright/test';
import { offlineMap } from './offline-map.ts';
import { pickSource } from './sources.ts';

test.use({ serviceWorkers: 'block' });

const hour = 3_600_000;
const now = Date.now();

/** Trips newest first: two today, one without a route, then five more than a year back. */
type Trip = { id: number; name: string; at: number; type: string; stationary?: boolean };
const trips = (<Trip[]>[
  { id: 11, name: 'Coast loop', at: now - 2 * hour, type: 'cycling:road' },
  { id: 12, name: 'Trail run', at: now - 3 * hour, type: 'running:trail' },
  { id: 13, name: 'Trainer session', at: now - 4 * hour, type: 'cycling:indoor', stationary: true },
  ...[21, 22, 23, 24, 25].map((id, i) => ({
    id,
    name: `Old ride ${id}`,
    at: now - (400 + i) * 24 * hour,
    type: 'cycling:road',
  })),
]).map(({ id, name, at, type, stationary }) => ({
  id,
  name,
  departed_at: new Date(at).toISOString(),
  activity_type: type,
  distance: 2000,
  first_lat: 39.57 + id / 1000,
  first_lng: 2.65,
  last_lat: 39.6,
  last_lng: 2.7,
  stationary: stationary ?? false,
  updated_at: new Date(at + hour).toISOString(),
}));

/** A trip's points: five minutes heading north-east from its start. */
const points = (trip: (typeof trips)[number]) =>
  Array.from({ length: 30 }, (_, i) => ({
    x: trip.first_lng + i * 0.0005,
    y: trip.first_lat + i * 0.0005,
    e: 100 + i,
    t: Math.floor(Date.parse(trip.departed_at) / 1000) + i * 10,
  }));

/** Answers the site's Ride with GPS Functions the way they answer a connected account. */
async function fakeRideWithGps(
  page: Page,
  options: { revoked?: boolean; pendingTracks?: Promise<void> } = {},
) {
  let connected = false;
  const fetched: number[] = [];
  const disconnects: number[] = [];
  await page.context().route('**/api/ridewithgps/connect', async (route) => {
    connected = true;
    await route.fulfill({ status: 303, headers: { Location: '/?ridewithgps=connected' } });
  });
  await page.context().route('**/api/ridewithgps/session', async (route) => {
    if (route.request().method() === 'DELETE') {
      disconnects.push(1);
      connected = false;
      return route.fulfill({ json: {} });
    }
    return route.fulfill({ json: { connected } });
  });
  await page.context().route('**/api/ridewithgps/trips?*', async (route) => {
    if (!connected || options.revoked) return route.fulfill({ status: 401 });
    const query = new URL(route.request().url()).searchParams;
    if (query.has('page')) return route.fulfill({ json: { trips, pages: 1 } });
    const trip = trips.find((t) => String(t.id) === query.get('trip'))!;
    fetched.push(trip.id);
    await options.pendingTracks;
    return route.fulfill({ json: { trip: { track_points: points(trip) } } });
  });
  return { fetched, disconnects };
}

test('uses Ride with GPS trips as the source, fetching tracks only when needed', async ({
  page,
}) => {
  await offlineMap(page.context());
  const { fetched, disconnects } = await fakeRideWithGps(page);
  await page.goto('/');
  await expect(page.getByTestId('choose-rwgps')).toContainText('Not connected');
  await pickSource(page, 'rwgps');
  await page.getByRole('link', { name: 'Connect Ride with GPS' }).click();

  // Back from the sign-in: this month's trips, the one without a route left out.
  await expect(page.getByTestId('source')).toContainText('Ride with GPS');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('chosen-count')).toContainText('2 of 2 activities selected');
  await expect(page.getByTestId('chosen')).toContainText('View on Ride with GPS');

  // Every period works on the whole list, without asking Ride with GPS again.
  await page.getByRole('button', { name: 'All time' }).click();
  await expect(page.getByTestId('chosen-count')).toContainText('7 of 7 activities selected');
  await page.getByRole('button', { name: 'This month' }).click();

  // Only the newest few are fetched ahead; the oldest only when a video needs them.
  await expect.poll(() => fetched.length).toBe(5);
  expect(fetched).not.toContain(25);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('replay-summary')).toBeVisible();
  expect(fetched).not.toContain(25);

  // A reload opens Ride with GPS again, and the fetched tracks come from this device.
  const before = fetched.length;
  await page.reload();
  await expect(page.getByTestId('source')).toContainText('Ride with GPS');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('replay-summary')).toBeVisible();
  expect(fetched.length).toBe(before);

  // Disconnecting goes back to the Source step and deletes the kept tracks.
  // Disconnecting stays with Ride with GPS, ready to connect again.
  await page.getByRole('button', { name: 'Source' }).click();
  await page.getByRole('button', { name: 'Disconnect Ride with GPS' }).click();
  await expect(page.getByRole('link', { name: 'Connect Ride with GPS' })).toBeVisible();
  await expect(page.getByTestId('chosen-source')).toHaveText('Ride with GPS');
  await expect(page.getByText('Ride with GPS disconnected')).toBeVisible();
  expect(disconnects).toEqual([1]);
  // A string, as the tests are type-checked without the browser's types.
  expect(await page.evaluate("caches.has('wornways-rwgps-tracks')")).toBe(false);
});

test('shows the download in a dialog that can be canceled', async ({ page }) => {
  await offlineMap(page.context());
  let release: () => void = () => undefined;
  const pendingTracks = new Promise<void>((resolve) => (release = resolve));
  const { fetched } = await fakeRideWithGps(page, { pendingTracks });
  await page.goto('/');
  await pickSource(page, 'rwgps');
  await page.getByRole('link', { name: 'Connect Ride with GPS' }).click();
  await page.getByRole('button', { name: 'All time' }).click();
  await expect(page.getByTestId('chosen-count')).toContainText('7 of 7 activities selected');

  await page.getByRole('button', { name: 'Continue' }).click();
  const dialog = page.getByTestId('download');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Downloading tracks from Ride with GPS');
  await expect(dialog).toContainText('0 of 7 tracks, 0%');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Download canceled.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose your activities' })).toBeVisible();

  // The downloads under way finish; going on again fetches only the rest.
  release();
  await expect.poll(() => fetched.length).toBeGreaterThanOrEqual(5);
  const before = new Set(fetched);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('replay-summary')).toBeVisible();
  expect(fetched.filter((id) => before.has(id)).length).toBe(before.size);
  expect(new Set(fetched).size).toBe(fetched.length);
});

test('switches between Ride with GPS and files without disconnecting', async ({ page }) => {
  await fakeRideWithGps(page);
  await page.goto('/');
  await pickSource(page, 'rwgps');
  await page.getByRole('link', { name: 'Connect Ride with GPS' }).click();
  await expect(page.getByTestId('source')).toContainText('Ride with GPS');

  await page.getByRole('button', { name: 'Change source' }).click();
  await expect(page.getByTestId('choose-rwgps')).toHaveAttribute('aria-checked', 'true');
  await pickSource(page, 'files');
  await expect(page.getByTestId('chosen-source')).toHaveText('Files');

  // Files were chosen last, so a reload stays with them; Ride with GPS is still connected.
  await page.reload();
  await expect(page.getByTestId('chosen-source')).toHaveText('Files');
  await page.getByRole('button', { name: 'Change source' }).click();
  await expect(page.getByTestId('choose-rwgps')).toContainText('Connected');
  await pickSource(page, 'rwgps');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('source')).toContainText('Ride with GPS');

  // And a reload now opens Ride with GPS again.
  await page.reload();
  await expect(page.getByTestId('source')).toContainText('Ride with GPS');
});

test('goes back to the Source step when Ride with GPS no longer accepts the connection', async ({
  page,
}) => {
  await fakeRideWithGps(page, { revoked: true });
  await page.goto('/');
  await pickSource(page, 'rwgps');
  await page.getByRole('link', { name: 'Connect Ride with GPS' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'The Ride with GPS connection ended. Connect again.',
  );
  // Back on the Ride with GPS screen, ready to connect again.
  await expect(page.getByRole('link', { name: 'Connect Ride with GPS' })).toBeVisible();
});

test('says so when the sign-in was canceled', async ({ page }) => {
  await fakeRideWithGps(page);
  await page.goto('/?ridewithgps=canceled');
  await expect(page.getByRole('alert')).toHaveText('Ride with GPS access was canceled.');
  await expect(page).toHaveURL(/\/$/);
});

test('is not offered where the site has no Ride with GPS client', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('choose-demo')).toBeVisible();
  await expect(page.getByTestId('choose-rwgps')).toHaveCount(0);
});
