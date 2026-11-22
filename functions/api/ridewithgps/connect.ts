// Starts connecting Ride with GPS: sends the person to its authorization page, with a state
// that the callback checks against the cookie set here.
import {
  callbackUrl,
  noStore,
  rideWithGpsReady,
  RWGPS,
  stateCookie,
  type RideWithGpsEnv,
} from '../../../cloudflare/ridewithgps.ts';

export function onRequestGet({ request, env }: { request: Request; env: RideWithGpsEnv }) {
  const origin = new URL(request.url).origin;
  if (!rideWithGpsReady(env, origin)) return new Response(null, { status: 404, headers: noStore });
  const state = crypto.randomUUID();
  const authorize = new URL(RWGPS + '/oauth/authorize');
  authorize.search = new URLSearchParams({
    client_id: env.RWGPS_CLIENT_ID!,
    redirect_uri: callbackUrl(origin),
    response_type: 'code',
    state,
  }).toString();
  return new Response(null, {
    status: 302,
    headers: { ...noStore, Location: authorize.href, 'Set-Cookie': stateCookie(state) },
  });
}
