import { channelFor, stravaReady, type StravaEnv } from '../../../../cloudflare/strava-session.ts';

type Context = {
  request: Request;
  env: StravaEnv;
  params: { key?: string };
  waitUntil(pending: Promise<unknown>): void;
};

type StravaEvent = {
  object_type?: string;
  aspect_type?: string;
  owner_id?: number;
  owner_id_str?: string;
  updates?: { authorized?: string; private?: string };
};

export async function onRequest({ request, env, params, waitUntil }: Context) {
  const url = new URL(request.url);
  if (!stravaReady(env, url.origin) || params.key !== env.STRAVA_WEBHOOK_TOKEN)
    return new Response(null, { status: 404 });

  if (request.method === 'GET') {
    const challenge = url.searchParams.get('hub.challenge');
    if (
      url.searchParams.get('hub.mode') !== 'subscribe' ||
      !challenge ||
      url.searchParams.get('hub.verify_token') !== env.STRAVA_WEBHOOK_TOKEN
    )
      return new Response(null, { status: 403 });
    return Response.json({ 'hub.challenge': challenge });
  }
  if (request.method !== 'POST') return new Response(null, { status: 405 });

  const raw = await request.text();
  let event: StravaEvent;
  try {
    event = JSON.parse(raw) as StravaEvent;
  } catch {
    return new Response(null, { status: 400 });
  }
  const revoked = event.object_type === 'athlete' && event.updates?.authorized === 'false';
  const changed =
    event.object_type === 'activity' &&
    (event.aspect_type === 'delete' || event.updates?.private === 'true');
  if (revoked || changed) {
    // Preserve a 64-bit ID if the event sends it as a JSON number.
    const owner = event.owner_id_str ?? /"owner_id"\s*:\s*(\d+)/.exec(raw)?.[1];
    if (owner && /^\d+$/.test(owner)) {
      waitUntil(
        (async () => {
          const channel = await channelFor(env.STRAVA_CLIENT_SECRET!, owner);
          const relay = env.STRAVA_EVENTS!;
          await relay.get(relay.idFromName(channel)).fetch(
            new Request('https://strava-events/invalidate', {
              method: 'POST',
              body: revoked ? 'revoked' : 'activity',
            }),
          );
        })(),
      );
    }
  }
  return new Response();
}
