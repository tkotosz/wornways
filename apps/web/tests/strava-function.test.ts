import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionCookie } from '../../../cloudflare/strava-cookie.ts';
import { channelFor, makeTicket } from '../../../cloudflare/strava-session.ts';
import { onRequest as activities } from '../../../functions/api/strava/activities.ts';
import { onRequestGet as events } from '../../../functions/api/strava/events.ts';
import { onRequest as oauth } from '../../../functions/api/strava/oauth.ts';
import { onRequest as webhook } from '../../../functions/api/strava/webhook/[key].ts';

const origin = 'https://wornways.example';
const secret = 'local-test-secret';
const hook = 'local-test-hook';
const athlete = '9007199254740999';
const sessionId = 'test-strava-session';
const accessToken = 'upstream-access-token';

async function signedIn(expiresAt = Date.now() + 600_000) {
  const cookie = await sessionCookie(
    {
      token: accessToken,
      ticket: await makeTicket(secret, athlete, expiresAt),
      expiresAt,
      sessionId,
      cacheKey: 'cache-key',
    },
    secret,
    origin,
  );
  return { cookie: cookie.split(';')[0]!, expiresAt };
}

function setup() {
  const notify = vi.fn<(request: Request) => Promise<Response>>().mockResolvedValue(new Response());
  const idFromName = vi.fn((name: string) => ({ name }));
  const env = {
    STRAVA_ORIGIN: origin,
    STRAVA_CLIENT_ID: '123',
    STRAVA_CLIENT_SECRET: secret,
    STRAVA_WEBHOOK_TOKEN: hook,
    STRAVA_EVENTS: { idFromName, get: () => ({ fetch: notify }) },
  };
  return { env, notify, idFromName };
}

afterEach(() => vi.unstubAllGlobals());

describe('the Strava Pages Functions', () => {
  it('returns only browser session metadata on exchange and reload', async () => {
    const { env } = setup();
    const upstream = vi.fn().mockResolvedValue(
      Response.json({
        access_token: accessToken,
        refresh_token: 'refresh',
        expires_at: Math.floor(Date.now() / 1000) + 600,
        athlete: { id_str: athlete },
      }),
    );
    vi.stubGlobal('fetch', upstream);
    const request = (from: string) =>
      new Request(origin + '/api/strava/oauth', {
        method: 'POST',
        headers: { Origin: from, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'test-code' }),
      });
    expect((await oauth({ request: request('https://other.example'), env })).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
    const response = await oauth({ request: request(origin), env });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const data = (await response.json()) as { sessionId: string };
    expect(Object.keys(data).sort()).toEqual(['cacheKey', 'expiresAt', 'sessionId']);
    const setCookie = response.headers.getSetCookie()[0]!;
    expect(setCookie).toContain('Path=/api/strava; Secure; HttpOnly; SameSite=Strict');
    expect(setCookie).not.toContain(accessToken);
    const cookie = setCookie.split(';')[0]!;
    const restore = (value: string) =>
      oauth({
        request: new Request(origin + '/api/strava/oauth', { headers: { Cookie: value } }),
        env,
      });
    expect(await (await restore(cookie)).json()).toEqual({ clientId: '123', session: data });
    expect(await (await restore(cookie + 'X')).json()).toEqual({ clientId: '123' });

    const ended = await oauth({
      request: new Request(origin + '/api/strava/oauth', {
        method: 'DELETE',
        headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: data.sessionId, disconnect: false }),
      }),
      env,
    });
    expect(ended.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('upgrades the old cookie without exposing the token or changing the cache key', async () => {
    const { env } = setup();
    const { cookie, expiresAt } = await signedIn();
    const legacy = cookie.replace('__Secure-wornways-strava-session=', '__Secure-wornways-strava=');
    const response = await oauth({
      request: new Request(origin + '/api/strava/oauth', { headers: { Cookie: legacy } }),
      env,
    });
    expect(await response.json()).toEqual({
      clientId: '123',
      session: { expiresAt, sessionId, cacheKey: 'cache-key' },
    });
    const [replacement, expired] = response.headers.getSetCookie();
    expect(replacement).toContain('__Secure-wornways-strava-session=');
    expect(expired).toContain('__Secure-wornways-strava=; Path=/api/strava/oauth;');
    expect(expired).toContain('Max-Age=0');
  });

  it('fetches the two allowed Strava resources with the matching session cookie', async () => {
    const { env } = setup();
    const { cookie } = await signedIn();
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json([
          {
            id_str: athlete,
            name: 'A ride',
            description: 'Private notes',
            map: { summary_polyline: 'abc', polyline: 'extra' },
          },
        ]),
      )
      .mockResolvedValueOnce(Response.json({ latlng: { data: [[47, 19]] }, time: { data: [0] } }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', upstream);
    const list = '?after=10&before=20&page=1';
    const load = (query: string, cookieValue: string, id = sessionId) =>
      activities({
        request: new Request(origin + '/api/strava/activities' + query, {
          headers: { Cookie: cookieValue, 'X-Wornways-Strava-Session': id },
        }),
        env,
      });
    expect((await load(list, '')).status).toBe(401);
    const expired = await signedIn(Date.now() - 1000);
    expect((await load(list, expired.cookie)).status).toBe(401);
    expect((await load(list, cookie, 'stale-session')).status).toBe(401);
    expect((await load(list + '&page=2', cookie)).status).toBe(400);
    expect((await load('?activity=1%2F2', cookie)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();

    const rows = await load(list, cookie);
    expect(rows.headers.get('Cache-Control')).toBe('no-store');
    expect(await rows.json()).toEqual([
      { id_str: athlete, name: 'A ride', map: { summary_polyline: 'abc' } },
    ]);
    expect(upstream.mock.calls[0]?.[0]).toBe(
      'https://www.strava.com/api/v3/athlete/activities?after=10&before=20&page=1&per_page=100',
    );
    expect(upstream.mock.calls[0]?.[1].headers.Authorization).toBe(`Bearer ${accessToken}`);
    expect(upstream.mock.calls[0]?.[1].cf.cacheTtlByStatus).toEqual({ '100-599': -1 });
    const track = await load('?activity=' + athlete, cookie);
    expect(track.headers.get('Cache-Control')).toBe('no-store');
    expect(await track.json()).toEqual({ latlng: { data: [[47, 19]] }, time: { data: [0] } });
    expect(upstream.mock.calls[1]?.[0]).toBe(
      `https://www.strava.com/api/v3/activities/${athlete}/streams?keys=latlng,time,altitude&key_by_type=true`,
    );
    expect((await load(list, cookie)).status).toBe(401);
  });

  it('revokes the cookie token on disconnect and leaves a newer session alone', async () => {
    const { env } = setup();
    const { cookie } = await signedIn();
    const upstream = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal('fetch', upstream);
    const disconnect = (id: string) =>
      oauth({
        request: new Request(origin + '/api/strava/oauth', {
          method: 'DELETE',
          headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: id, disconnect: true }),
        }),
        env,
      });
    const stale = await disconnect('stale-session');
    expect(stale.status).toBe(409);
    expect(stale.headers.has('Set-Cookie')).toBe(false);
    expect(upstream).not.toHaveBeenCalled();
    const response = await disconnect(sessionId);
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()[0]).toContain('Max-Age=0');
    expect(upstream.mock.calls[0]?.[0]).toBe('https://www.strava.com/oauth/revoke');
    expect(upstream.mock.calls[0]?.[1].body.get('token')).toBe(accessToken);
  });

  it('requires the cookie for the relay and strips it before forwarding the connection', async () => {
    const { env, notify, idFromName } = setup();
    const { cookie } = await signedIn();
    const connect = (value: string, protocol = `session.${sessionId}`) =>
      events({
        request: new Request(origin + '/api/strava/events', {
          headers: {
            Origin: origin,
            Cookie: value,
            Upgrade: 'websocket',
            'Sec-WebSocket-Protocol': protocol,
          },
        }),
        env,
      });
    expect((await connect('')).status).toBe(401);
    expect((await connect(cookie, 'session.old')).status).toBe(401);
    expect(notify).not.toHaveBeenCalled();
    expect((await connect(cookie)).status).toBe(200);
    expect(idFromName).toHaveBeenCalledWith(await channelFor(secret, athlete));
    expect(notify.mock.calls[0]?.[0].headers.has('Cookie')).toBe(false);
  });

  it('validates the webhook and sends a revocation to the exact athlete channel', async () => {
    const { env, notify, idFromName } = setup();
    const route = origin + '/api/strava/webhook/' + hook;
    const jobs: Promise<unknown>[] = [];
    const process = (request: Request, key = hook) =>
      webhook({
        request,
        env,
        params: { key },
        waitUntil: (task) => jobs.push(task),
      });
    const check = new Request(
      route + '?hub.mode=subscribe&hub.verify_token=' + hook + '&hub.challenge=42',
    );
    expect(await (await process(check)).json()).toEqual({ 'hub.challenge': '42' });
    expect((await process(check, 'incorrect')).status).toBe(404);

    const event = new Request(route, {
      method: 'POST',
      body: '{"object_type":"athlete","aspect_type":"update","owner_id":9007199254740999,"updates":{"authorized":"false"}}',
    });
    expect((await process(event)).status).toBe(200);
    await Promise.all(jobs);
    expect(idFromName).toHaveBeenCalledWith(await channelFor(secret, athlete));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(await notify.mock.calls[0]?.[0].text()).toBe('revoked');
  });
});
