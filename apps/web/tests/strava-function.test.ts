import { afterEach, describe, expect, it, vi } from 'vitest';
import { channelFor, ticketChannel } from '../../../cloudflare/strava-session.ts';
import { onRequest as oauth } from '../../../functions/api/strava/oauth.ts';
import { onRequest as webhook } from '../../../functions/api/strava/webhook/[key].ts';

const origin = 'https://wornways.example';
const secret = 'local-test-secret';
const hook = 'local-test-hook';
const athlete = '9007199254740999';

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
  it('exchanges a same-origin code without returning the refresh token or athlete data', async () => {
    const { env } = setup();
    const upstream = vi.fn().mockResolvedValue(
      Response.json({
        access_token: 'short-lived',
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
    const data = (await response.json()) as { ticket: string; token: string };
    expect(Object.keys(data).sort()).toEqual(['expiresAt', 'ticket', 'token']);
    expect(data.token).toBe('short-lived');
    const channel = await channelFor(secret, athlete);
    expect(await ticketChannel(secret, data.ticket)).toBe(channel);
    expect(await ticketChannel('different-key', data.ticket)).toBeNull();
    expect(await ticketChannel(secret, data.ticket.replace(channel, '0'.repeat(64)))).toBeNull();
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
