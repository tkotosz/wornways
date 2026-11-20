import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest as garmin } from '../../../functions/api/garmin.ts';

const origin = 'https://wornways.example';
const endpoint = origin + '/api/garmin';
const api = 'https://personal.connectapi.garmin.com';
const env = { GARMIN_PERSONAL_ENABLED: '1' };

function authorize(from: string, key: string) {
  return new Request(endpoint, {
    method: 'POST',
    headers: { Origin: from, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
}

function token(exp: number) {
  return `test.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;
}

afterEach(() => vi.unstubAllGlobals());

describe('the Garmin Connect Pages Function', () => {
  it('reports availability only on an opted-in deployment and rejects cross-origin key submissions', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const request = new Request(endpoint);
    expect((await garmin({ request, env: {} })).status).toBe(404);
    const available = await garmin({ request, env });
    expect(available.headers.get('Cache-Control')).toBe('no-store');
    expect(await available.json()).toEqual({ available: true });

    const rejected = await garmin({ request: authorize('https://other.example', 'test-key'), env });
    expect(rejected.status).toBe(403);
    const malformed = await garmin({ request: authorize(origin, 'invalid key'), env });
    expect(malformed.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('exchanges the key for Garmin’s plain-text token and bounds the Wornways session', async () => {
    const now = Date.now();
    const shortExpiry = Math.floor(now / 1000) + 600;
    const longExpiry = Math.floor(now / 1000) + 24 * 60 * 60;
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(new Response(token(shortExpiry) + '\n'))
      .mockResolvedValueOnce(new Response(token(longExpiry)));
    vi.stubGlobal('fetch', upstream);

    const response = await garmin({ request: authorize(origin, 'test-key'), env });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(await response.json()).toEqual({
      token: token(shortExpiry),
      expiresAt: shortExpiry * 1000,
    });
    expect(upstream).toHaveBeenCalledWith(
      api + '/personalapitoken-service/personal-api/personal-api-key/token',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'ApiKey test-key', Accept: '*/*' },
        cache: 'no-store',
        redirect: 'manual',
      }),
    );

    const long = await garmin({ request: authorize(origin, 'test-key'), env });
    const session = (await long.json()) as { expiresAt: number };
    expect(session.expiresAt).toBeGreaterThanOrEqual(now + 2 * 60 * 60 * 1000);
    expect(session.expiresAt).toBeLessThanOrEqual(Date.now() + 2 * 60 * 60 * 1000);
  });

  it('allows only documented activity search fields and numeric download paths', async () => {
    const rows = [{ activityId: 123, activityName: 'Test ride' }];
    const bytes = Uint8Array.of(0x50, 0x4b, 3, 4);
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(Response.json(rows))
      .mockResolvedValueOnce(new Response(bytes));
    vi.stubGlobal('fetch', upstream);
    const headers = { Authorization: `Bearer ${token(Math.floor(Date.now() / 1000) + 600)}` };
    const read = (query: string) =>
      garmin({ request: new Request(endpoint + query, { headers }), env });

    const missingToken = await garmin({ request: new Request(endpoint + '?start=0'), env });
    expect(missingToken.status).toBe(401);
    for (const query of [
      '?startDate=2026-02-30',
      '?limit=100',
      '?limit=2&limit=3',
      '?search=x',
      '?activity=../123',
      '?activity=123&start=1',
    ]) {
      expect((await read(query)).status).toBe(400);
    }
    expect(upstream).not.toHaveBeenCalled();

    const query = '?start=99&limit=99&startDate=2026-03-01&endDate=2026-03-31';
    const search = await read(query);
    expect(await search.json()).toEqual(rows);
    expect(search.headers.get('Cache-Control')).toBe('no-store');
    expect(upstream).toHaveBeenCalledWith(
      api + '/activitylist-service/activities/search/activities' + query,
      expect.objectContaining({
        method: 'GET',
        headers: { ...headers, Accept: '*/*' },
        redirect: 'manual',
      }),
    );

    const download = await read('?activity=9007199254740999');
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);
    expect(download.headers.get('Cache-Control')).toBe('no-store');
    expect(upstream).toHaveBeenCalledWith(
      api + '/download-service/files/activity/9007199254740999',
      expect.anything(),
    );
  });

  it('maps Garmin failures without including upstream error bodies', async () => {
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(new Response('private diagnostic', { status: 403 }))
      .mockResolvedValueOnce(new Response('private diagnostic', { status: 429 }))
      .mockResolvedValueOnce(new Response('private diagnostic', { status: 404 }))
      .mockResolvedValueOnce(Response.redirect('https://other.example/activity'));
    vi.stubGlobal('fetch', upstream);
    const signIn = await garmin({ request: authorize(origin, 'test-key'), env });
    expect(signIn.status).toBe(401);
    expect(await signIn.text()).not.toContain('private diagnostic');

    const headers = { Authorization: `Bearer ${token(Math.floor(Date.now() / 1000) + 600)}` };
    const search = await garmin({ request: new Request(endpoint + '?start=0', { headers }), env });
    expect(search.status).toBe(429);
    expect(await search.text()).not.toContain('private diagnostic');
    const download = await garmin({
      request: new Request(endpoint + '?activity=123', { headers }),
      env,
    });
    expect(download.status).toBe(404);
    expect(await download.text()).not.toContain('private diagnostic');
    const redirected = await garmin({
      request: new Request(endpoint + '?activity=123', { headers }),
      env,
    });
    expect(redirected.status).toBe(502);
    expect(redirected.headers.has('Location')).toBe(false);
  });
});
