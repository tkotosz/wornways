// Reads the connected account's trips for the page, with the token from the session cookie.
//   ?page=<n>   one page of the trip list, only the fields Wornways uses
//   ?trip=<id>  one trip with its track points, passed through as Ride with GPS sends it
import {
  expiredSessionCookie,
  noStore,
  readSession,
  rideWithGpsReady,
  RWGPS,
  type RideWithGpsEnv,
} from '../../../cloudflare/ridewithgps.ts';

const PAGE_SIZE = 200;

/** A trip in the list, as this Function returns it. */
export type TripRow = {
  id: number;
  name: string | null;
  departed_at: string | null;
  activity_type: string | null;
  distance: number | null;
  first_lat: number | null;
  first_lng: number | null;
  last_lat: number | null;
  last_lng: number | null;
  stationary: boolean | null;
  updated_at: string | null;
};

export type TripPage = { trips: TripRow[]; pages: number };

function upstreamPath(query: URLSearchParams): string | null {
  const trip = query.get('trip');
  const page = query.get('page');
  if (query.size !== 1) return null;
  if (trip !== null) return /^[1-9]\d{0,14}$/.test(trip) ? `/api/v1/trips/${trip}.json` : null;
  if (page === null || !/^[1-9]\d{0,5}$/.test(page)) return null;
  return `/api/v1/trips.json?${new URLSearchParams({ page, page_size: String(PAGE_SIZE) })}`;
}

const row = (trip: Record<string, unknown>): TripRow => ({
  id: trip.id as number,
  name: (trip.name as string | null) ?? null,
  departed_at: (trip.departed_at as string | null) ?? null,
  activity_type: (trip.activity_type as string | null) ?? null,
  distance: (trip.distance as number | null) ?? null,
  first_lat: (trip.first_lat as number | null) ?? null,
  first_lng: (trip.first_lng as number | null) ?? null,
  last_lat: (trip.last_lat as number | null) ?? null,
  last_lng: (trip.last_lng as number | null) ?? null,
  stationary: (trip.stationary as boolean | null) ?? null,
  updated_at: (trip.updated_at as string | null) ?? null,
});

export async function onRequestGet({ request, env }: { request: Request; env: RideWithGpsEnv }) {
  const url = new URL(request.url);
  if (!rideWithGpsReady(env, url.origin))
    return new Response(null, { status: 404, headers: noStore });
  const session = await readSession(request, env.RWGPS_CLIENT_SECRET!, url.origin);
  if (!session) return new Response(null, { status: 401, headers: noStore });
  const path = upstreamPath(url.searchParams);
  if (!path) return new Response(null, { status: 400, headers: noStore });

  try {
    const response = await fetch(RWGPS + path, {
      headers: { Authorization: `Bearer ${session.token}`, Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]),
    });
    if (!response.ok) {
      const status = response.status;
      // A token that Ride with GPS no longer accepts was revoked there: the connection ends.
      if (status === 401)
        return new Response(null, {
          status,
          headers: { ...noStore, 'Set-Cookie': expiredSessionCookie },
        });
      const passed = status === 429 || (status === 404 && url.searchParams.has('trip'));
      return new Response(null, { status: passed ? status : 502, headers: noStore });
    }
    // A long trip's points are megabytes of JSON: streamed through, not parsed here.
    if (url.searchParams.has('trip'))
      return new Response(response.body, {
        headers: { ...noStore, 'Content-Type': 'application/json' },
      });

    const data = (await response.json()) as {
      trips?: Record<string, unknown>[];
      meta?: { pagination?: { page_count?: number } };
    };
    const trips = (data.trips ?? []).filter((trip) => Number.isSafeInteger(trip.id)).map(row);
    const pages = data.meta?.pagination?.page_count;
    const page: TripPage = { trips, pages: Number.isSafeInteger(pages) ? pages! : 0 };
    return Response.json(page, { headers: noStore });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499, headers: noStore });
    return new Response(null, { status: 502, headers: noStore });
  }
}
