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
  const channel =
    protocol.startsWith('session.') &&
    (await ticketChannel(env.STRAVA_CLIENT_SECRET!, protocol.slice('session.'.length)));
  if (!channel) return new Response(null, { status: 403 });

  const relay = env.STRAVA_EVENTS!;
  return relay.get(relay.idFromName(channel)).fetch(request);
}
