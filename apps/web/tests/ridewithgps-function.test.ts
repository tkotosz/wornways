import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionCookie } from '../../../cloudflare/ridewithgps.ts';
import { onRequestGet as callback } from '../../../functions/api/ridewithgps/callback.ts';
import { onRequestGet as connect } from '../../../functions/api/ridewithgps/connect.ts';
import { onRequest as session } from '../../../functions/api/ridewithgps/session.ts';
import { onRequestGet as trips } from '../../../functions/api/ridewithgps/trips.ts';

const origin = 'https://wornways.example';
const secret = 'local-test-secret';
const token = 'upstream-access-token';
const env = { RWGPS_ORIGIN: origin, RWGPS_CLIENT_ID: '42', RWGPS_CLIENT_SECRET: secret };
const state = '0b7d3f1e-8a52-4c1b-9d6e-2f4a6c8e0b13';
const stateCookie = `__Secure-wornways-rwgps-state=${state}`;

async function signedIn(): Promise<string> {
  const cookie = await sessionCookie({ token, expiresAt: Date.now() + 600_000 }, secret, origin);
  return cookie.split(';')[0]!;
}

const get = (path: string, cookie?: string) =>
  new Request(origin + path, { headers: cookie ? { Cookie: cookie } : {} });

afterEach(() => vi.unstubAllGlobals());

describe('the Ride with GPS Pages Functions', () => {
  it('are not there on a deployment without the API client, or at another origin', async () => {
    expect((await connect({ request: get('/api/ridewithgps/connect'), env: {} })).status).toBe(404);
    const elsewhere = new Request('https://other.example/api/ridewithgps/session');
    expect((await session({ request: elsewhere, env })).status).toBe(404);
  });

  it('send the person to Ride with GPS with a state kept in a cookie', async () => {
    const response = connect({ request: get('/api/ridewithgps/connect'), env });
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('Location')!);
    expect(location.origin + location.pathname).toBe('https://ridewithgps.com/oauth/authorize');
    expect(location.searchParams.get('client_id')).toBe('42');
    expect(location.searchParams.get('redirect_uri')).toBe(origin + '/api/ridewithgps/callback');
    expect(location.searchParams.get('response_type')).toBe('code');
    const cookie = response.headers.get('Set-Cookie')!;
    expect(cookie).toContain(`=${location.searchParams.get('state')};`);
    expect(cookie).toContain('Path=/api/ridewithgps/callback; Secure; HttpOnly; SameSite=Lax');
  });

  it('refuse a callback whose state does not match the cookie', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const path = `/api/ridewithgps/callback?code=c&state=${state}`;
    for (const cookie of [undefined, '__Secure-wornways-rwgps-state=' + crypto.randomUUID()]) {
      const response = await callback({ request: get(path, cookie), env });
      expect(response.headers.get('Location')).toBe(origin + '/?ridewithgps=expired');
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it('report a canceled sign-in', async () => {
    const path = `/api/ridewithgps/callback?error=access_denied&state=${state}`;
    const response = await callback({ request: get(path, stateCookie), env });
    expect(response.headers.get('Location')).toBe(origin + '/?ridewithgps=canceled');
  });

  it('trade the code for a token kept only in a sealed cookie', async () => {
    const upstream = vi
      .fn()
      .mockResolvedValue(Response.json({ access_token: token, token_type: 'Bearer', user_id: 7 }));
    vi.stubGlobal('fetch', upstream);
    const path = `/api/ridewithgps/callback?code=the-code&state=${state}`;
    const response = await callback({ request: get(path, stateCookie), env });

    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://ridewithgps.com/oauth/token.json');
    expect(JSON.parse(init.body as string)).toEqual({
      grant_type: 'authorization_code',
      code: 'the-code',
      client_id: '42',
      client_secret: secret,
      redirect_uri: origin + '/api/ridewithgps/callback',
    });
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe(origin + '/?ridewithgps=connected');
    const cookies = response.headers.getSetCookie();
    expect(cookies[0]).toContain('__Secure-wornways-rwgps-state=; ');
    expect(cookies[1]).toContain('Path=/api/ridewithgps; Secure; HttpOnly; SameSite=Strict');
    const age = Number(/Max-Age=(\d+)/.exec(cookies[1]!)![1]);
    expect(age).toBeGreaterThan(30 * 24 * 60 * 60 - 60);
    expect(age).toBeLessThanOrEqual(30 * 24 * 60 * 60);
    expect(cookies.join()).not.toContain(token);

    const status = await session({ request: get('/api/ridewithgps/session', cookies[1]), env });
    expect(await status.json()).toEqual({ connected: true });
  });

  it('say when this browser is not connected', async () => {
    const status = await session({ request: get('/api/ridewithgps/session'), env });
    expect(await status.json()).toEqual({ connected: false });
  });

  it('revoke the token on disconnect, only for a request from the app', async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal('fetch', upstream);
    const cookie = await signedIn();
    const disconnect = (from: string) =>
      session({
        request: new Request(origin + '/api/ridewithgps/session', {
          method: 'DELETE',
          headers: { Cookie: cookie, Origin: from, 'Content-Type': 'application/json' },
          body: '{}',
        }),
        env,
      });
    expect((await disconnect('https://other.example')).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
    const response = await disconnect(origin);
    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://ridewithgps.com/oauth/revoke.json');
    expect(JSON.parse(init.body as string)).toEqual({
      client_id: '42',
      client_secret: secret,
      token,
    });
  });

  it('list trips with only the fields the app uses', async () => {
    const upstream = vi.fn().mockResolvedValue(
      Response.json({
        trips: [
          {
            id: 11,
            name: 'Coast loop',
            departed_at: '2026-05-02T08:00:00-07:00',
            activity_type: 'cycling:road',
            distance: 40237,
            first_lat: 45.5,
            first_lng: -122.6,
            last_lat: 45.52,
            last_lng: -122.65,
            stationary: false,
            updated_at: '2026-05-03T10:00:00-07:00',
            description: 'private notes',
            avg_hr: 140,
          },
        ],
        meta: { pagination: { page_count: 3 } },
      }),
    );
    vi.stubGlobal('fetch', upstream);
    const response = await trips({
      request: get('/api/ridewithgps/trips?page=2', await signedIn()),
      env,
    });
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://ridewithgps.com/api/v1/trips.json?page=2&page_size=200');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);
    expect(await response.json()).toEqual({
      trips: [
        {
          id: 11,
          name: 'Coast loop',
          departed_at: '2026-05-02T08:00:00-07:00',
          activity_type: 'cycling:road',
          distance: 40237,
          first_lat: 45.5,
          first_lng: -122.6,
          last_lat: 45.52,
          last_lng: -122.65,
          stationary: false,
          updated_at: '2026-05-03T10:00:00-07:00',
        },
      ],
      pages: 3,
    });
  });

  it('pass one trip through, and refuse other queries', async () => {
    const body = JSON.stringify({ trip: { track_points: [{ x: 1, y: 2, t: 3 }] } });
    const upstream = vi.fn().mockResolvedValue(new Response(body));
    vi.stubGlobal('fetch', upstream);
    const cookie = await signedIn();
    const response = await trips({ request: get('/api/ridewithgps/trips?trip=11', cookie), env });
    expect(upstream.mock.calls[0]![0]).toBe('https://ridewithgps.com/api/v1/trips/11.json');
    expect(await response.text()).toBe(body);
    for (const query of ['trip=../users', 'page=0', 'page=1&trip=2', 'other=1'])
      expect(
        (await trips({ request: get('/api/ridewithgps/trips?' + query, cookie), env })).status,
      ).toBe(400);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect((await trips({ request: get('/api/ridewithgps/trips?page=1'), env })).status).toBe(401);
  });

  it('end the connection when Ride with GPS no longer accepts the token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const response = await trips({
      request: get('/api/ridewithgps/trips?page=1', await signedIn()),
      env,
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('Set-Cookie')).toContain('__Secure-wornways-rwgps-session=; ');
  });
});
