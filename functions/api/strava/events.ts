import { readSession } from '../../../cloudflare/strava-cookie.ts';
import { stravaReady, ticketChannel, type StravaEnv } from '../../../cloudflare/strava-session.ts';

export async function onRequestGet({ request, env }: { request: Request; env: StravaEnv }) {
  const url = new URL(request.url);
  if (!stravaReady(env, url.origin)) return new Response(null, { status: 404 });
  if (
    request.headers.get('Upgrade')?.toLowerCase() !== 'websocket' ||
    request.headers.get('Origin') !== url.origin
  )
    return new Response(null, { status: 403 });

  const protocol = request.headers.get('Sec-WebSocket-Protocol') ?? '';
  const secret = env.STRAVA_CLIENT_SECRET!;
  const session = await readSession(request, secret, url.origin);
  if (!session || protocol !== `session.${session.sessionId}`)
    return new Response(null, { status: 401 });
  const channel = await ticketChannel(secret, session.ticket);
  if (!channel) return new Response(null, { status: 403 });

  const headers = new Headers(request.headers);
  headers.delete('Cookie');
  headers.delete('Authorization');
  const relay = env.STRAVA_EVENTS!;
  return relay.get(relay.idFromName(channel)).fetch(new Request(request, { headers }));
}
