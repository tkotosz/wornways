// The public client ID is used to build the authorization link. Only this Function
// sees the client secret or the refresh token Strava returns.
import { makeTicket, stravaReady, type StravaEnv } from '../../../cloudflare/strava-session.ts';

type Context = { request: Request; env: StravaEnv };

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

export async function onRequest({ request, env }: Context): Promise<Response> {
  const origin = new URL(request.url).origin;
  if (!stravaReady(env, origin)) return json({ error: 'Strava is unavailable on this site.' }, 404);
  const clientId = env.STRAVA_CLIENT_ID!;
  const secret = env.STRAVA_CLIENT_SECRET!;

  if (request.method === 'GET') return json({ clientId });
  if (request.method !== 'POST' && request.method !== 'DELETE') return json({}, 405);
  if (
    request.headers.get('Origin') !== origin ||
    request.headers.get('Content-Type') !== 'application/json'
  )
    return json({}, 403);

  try {
    if (request.method === 'DELETE') {
      const { token } = (await request.json()) as { token?: unknown };
      if (typeof token !== 'string' || !token || token.length > 1024)
        return json({ error: 'The Strava session is missing.' }, 400);
      const response = await fetch('https://www.strava.com/oauth/revoke', {
        method: 'POST',
        headers: { Authorization: 'Basic ' + btoa(clientId + ':' + secret) },
        body: new URLSearchParams({ token, token_type_hint: 'access_token' }),
      });
      return response.ok ? json({}) : json({ error: 'Strava could not disconnect the app.' }, 502);
    }

    const { code } = (await request.json()) as { code?: unknown };
    if (typeof code !== 'string' || !code || code.length > 1024)
      return json({ error: 'The Strava sign-in code is missing.' }, 400);
    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: secret,
        grant_type: 'authorization_code',
        code,
      }),
    });
    if (!response.ok) return json({ error: 'The Strava sign-in failed. Connect again.' }, 502);
    const data = (await response.json()) as {
      access_token?: string;
      expires_at?: number;
      athlete?: { id?: number; id_str?: string };
    };
    const athlete =
      data.athlete?.id_str ??
      (Number.isSafeInteger(data.athlete?.id) ? String(data.athlete?.id) : '');
    const expiresAt = (data.expires_at ?? 0) * 1000;
    if (!data.access_token || expiresAt <= Date.now() || !/^\d+$/.test(athlete))
      return json({ error: 'Strava did not return a usable session.' }, 502);
    return json({
      token: data.access_token,
      expiresAt,
      ticket: await makeTicket(secret, athlete, expiresAt),
    });
  } catch {
    return json({ error: 'Strava could not complete the request. Try again.' }, 502);
  }
}
