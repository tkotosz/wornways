// GET: whether this browser is connected to Ride with GPS (404 when the deployment does not
// offer it). DELETE: disconnects, revoking the token at Ride with GPS and ending the cookie.
import {
  expiredSessionCookie,
  noStore,
  readSession,
  rideWithGpsReady,
  RWGPS,
  type RideWithGpsEnv,
} from '../../../cloudflare/ridewithgps.ts';

function json(body: unknown, status = 200, cookie?: string): Response {
  const headers = new Headers(noStore);
  if (cookie) headers.append('Set-Cookie', cookie);
  return Response.json(body, { status, headers });
}

export async function onRequest({ request, env }: { request: Request; env: RideWithGpsEnv }) {
  const origin = new URL(request.url).origin;
  if (!rideWithGpsReady(env, origin))
    return json({ error: 'Ride with GPS is unavailable on this site.' }, 404);
  const secret = env.RWGPS_CLIENT_SECRET!;
  const session = await readSession(request, secret, origin);

  if (request.method === 'GET') return json({ connected: !!session });
  if (request.method !== 'DELETE') return json({}, 405);
  if (
    request.headers.get('Origin') !== origin ||
    request.headers.get('Content-Type') !== 'application/json'
  )
    return json({}, 403);
  if (!session) return json({}, 200, expiredSessionCookie);

  const response = await fetch(RWGPS + '/oauth/revoke.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.RWGPS_CLIENT_ID,
      client_secret: secret,
      token: session.token,
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  // The cookie ends either way; a token Ride with GPS did not revoke can be removed there.
  return response?.ok
    ? json({}, 200, expiredSessionCookie)
    : json({ error: 'Ride with GPS could not disconnect the app.' }, 502, expiredSessionCookie);
}
