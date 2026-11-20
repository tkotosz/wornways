// The public client ID is used to build the authorization link. Only this Function
// sees the client secret or the refresh token Strava returns.
import {
  expiredLegacyCookie,
  expiredSessionCookie,
  readLegacySession,
  readSession,
  sessionCookie,
  sessionInfo,
  STRAVA_SESSION_MS,
} from '../../../cloudflare/strava-cookie.ts';
import { makeTicket, stravaReady, type StravaEnv } from '../../../cloudflare/strava-session.ts';

type Context = { request: Request; env: StravaEnv };

function json(body: unknown, status = 200, ...cookies: string[]): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return Response.json(body, { status, headers });
}

export async function onRequest({ request, env }: Context): Promise<Response> {
  const origin = new URL(request.url).origin;
  if (!stravaReady(env, origin)) return json({ error: 'Strava is unavailable on this site.' }, 404);
  const clientId = env.STRAVA_CLIENT_ID!;
  const secret = env.STRAVA_CLIENT_SECRET!;

  if (request.method === 'GET') {
    const session = await readSession(request, secret, origin);
    if (session) return json({ clientId, session: sessionInfo(session) });
    const legacy = await readLegacySession(request, secret, origin);
    if (legacy)
      return json(
        { clientId, session: sessionInfo(legacy) },
        200,
        await sessionCookie(legacy, secret, origin),
        expiredLegacyCookie,
      );
    return json({ clientId });
  }
  if (request.method !== 'POST' && request.method !== 'DELETE') return json({}, 405);
  if (
    request.headers.get('Origin') !== origin ||
    request.headers.get('Content-Type') !== 'application/json'
  )
    return json({}, 403);

  try {
    if (request.method === 'DELETE') {
      const { sessionId, disconnect } = (await request.json()) as {
        sessionId?: unknown;
        disconnect?: unknown;
      };
      if (typeof sessionId !== 'string' || !sessionId || typeof disconnect !== 'boolean')
        return json({ error: 'The Strava session is missing.' }, 400);
      const session = await readSession(request, secret, origin);
      if (!session || session.sessionId !== sessionId)
        return disconnect ? json({ error: 'This Strava session already ended.' }, 409) : json({});
      const cookies = [expiredSessionCookie, expiredLegacyCookie];
      if (!disconnect) return json({}, 200, ...cookies);

      const response = await fetch('https://www.strava.com/oauth/revoke', {
        method: 'POST',
        headers: { Authorization: 'Basic ' + btoa(clientId + ':' + secret) },
        body: new URLSearchParams({ token: session.token, token_type_hint: 'access_token' }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);
      return response?.ok
        ? json({}, 200, ...cookies)
        : json({ error: 'Strava could not disconnect the app.' }, 502, ...cookies);
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
    const expiresAt = Math.min((data.expires_at ?? 0) * 1000, Date.now() + STRAVA_SESSION_MS);
    if (
      !data.access_token ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now() ||
      !/^\d+$/.test(athlete)
    )
      return json({ error: 'Strava did not return a usable session.' }, 502);
    const session = {
      token: data.access_token,
      expiresAt,
      ticket: await makeTicket(secret, athlete, expiresAt),
      sessionId: crypto.randomUUID(),
      cacheKey: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),
    };
    return json(
      sessionInfo(session),
      200,
      await sessionCookie(session, secret, origin),
      expiredLegacyCookie,
    );
  } catch {
    return json({ error: 'Strava could not complete the request. Try again.' }, 502);
  }
}
