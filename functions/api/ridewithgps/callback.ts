// Ride with GPS sends the person back here with an authorization code. This Function trades
// the code for a token, seals the token into the session cookie and sends the person on to
// the app, with `?ridewithgps=<outcome>` telling the page how the sign-in went.
import {
  callbackUrl,
  expiredStateCookie,
  noStore,
  readState,
  rideWithGpsReady,
  RWGPS,
  SESSION_MS,
  sessionCookie,
  type RideWithGpsEnv,
} from '../../../cloudflare/ridewithgps.ts';

export type Outcome = 'connected' | 'canceled' | 'expired' | 'failed';

function back(origin: string, outcome: Outcome, ...cookies: string[]): Response {
  const headers = new Headers({ ...noStore, Location: `${origin}/?ridewithgps=${outcome}` });
  for (const cookie of [expiredStateCookie, ...cookies]) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
}

export async function onRequestGet({ request, env }: { request: Request; env: RideWithGpsEnv }) {
  const url = new URL(request.url);
  const origin = url.origin;
  if (!rideWithGpsReady(env, origin)) return new Response(null, { status: 404, headers: noStore });

  // A sign-in started somewhere else, or more than ten minutes ago, is not finished here.
  const state = readState(request);
  if (!state || url.searchParams.get('state') !== state) return back(origin, 'expired');
  if (url.searchParams.has('error')) {
    return back(origin, url.searchParams.get('error') === 'access_denied' ? 'canceled' : 'failed');
  }
  const code = url.searchParams.get('code');
  if (!code || code.length > 1024) return back(origin, 'failed');

  try {
    const response = await fetch(RWGPS + '/oauth/token.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: env.RWGPS_CLIENT_ID,
        client_secret: env.RWGPS_CLIENT_SECRET,
        redirect_uri: callbackUrl(origin),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return back(origin, 'failed');
    const data = (await response.json()) as { access_token?: unknown };
    if (
      typeof data.access_token !== 'string' ||
      !data.access_token ||
      data.access_token.length > 512
    )
      return back(origin, 'failed');
    const session = { token: data.access_token, expiresAt: Date.now() + SESSION_MS };
    return back(
      origin,
      'connected',
      await sessionCookie(session, env.RWGPS_CLIENT_SECRET!, origin),
    );
  } catch {
    return back(origin, 'failed');
  }
}
