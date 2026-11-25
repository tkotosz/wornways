import { readSession } from '../../../cloudflare/strava-cookie.ts';
import { stravaReady, type StravaEnv } from '../../../cloudflare/strava-session.ts';

const API = 'https://www.strava.com/api/v3';
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

function upstreamPath(query: URLSearchParams): string | null {
  const activity = query.get('activity');
  if (activity !== null) {
    if (query.size !== 1 || !/^[1-9]\d{0,18}$/.test(activity) || BigInt(activity) > 2n ** 63n - 1n)
      return null;
    return `/activities/${activity}/streams?keys=latlng,time,altitude,heartrate,cadence,watts,temp&key_by_type=true`;
  }
  const after = query.get('after');
  const before = query.get('before');
  const page = query.get('page');
  if (
    query.size !== 3 ||
    after === null ||
    !/^-?\d{1,13}$/.test(after) ||
    before === null ||
    !/^-?\d{1,13}$/.test(before) ||
    Number(after) >= Number(before) ||
    page === null ||
    !/^[1-9]\d{0,8}$/.test(page)
  )
    return null;
  return `/athlete/activities?${new URLSearchParams({ after, before, page, per_page: '100' })}`;
}

type Summary = {
  id: number;
  id_str?: string;
  name: string;
  sport_type?: string;
  type?: string;
  start_date: string;
  distance: number;
  start_latlng?: number[] | null;
  end_latlng?: number[] | null;
  elapsed_time?: number;
  visibility?: string;
  private?: boolean;
  map?: { summary_polyline?: string };
};

function replaySummary(row: Summary): Summary {
  return {
    id: row.id,
    id_str: row.id_str,
    name: row.name,
    sport_type: row.sport_type,
    type: row.type,
    start_date: row.start_date,
    distance: row.distance,
    start_latlng: row.start_latlng,
    end_latlng: row.end_latlng,
    elapsed_time: row.elapsed_time,
    visibility: row.visibility,
    private: row.private,
    map: row.map && { summary_polyline: row.map.summary_polyline },
  };
}

export async function onRequest({
  request,
  env,
}: {
  request: Request;
  env: StravaEnv;
}): Promise<Response> {
  const url = new URL(request.url);
  if (!stravaReady(env, url.origin)) return new Response(null, { status: 404, headers });
  if (request.method !== 'GET') return new Response(null, { status: 405, headers });

  // An older tab must never read activity data using a replacement session's cookie.
  const session = await readSession(request, env.STRAVA_CLIENT_SECRET!, url.origin);
  if (!session || session.sessionId !== request.headers.get('X-Wornways-Strava-Session'))
    return new Response(null, { status: 401, headers });
  const path = upstreamPath(url.searchParams);
  if (!path) return new Response(null, { status: 400, headers });

  const track = url.searchParams.has('activity');
  try {
    const options = {
      headers: { Authorization: `Bearer ${session.token}`, 'Cache-Control': 'no-store' },
      cf: { cacheTtlByStatus: { '100-599': -1 } },
      redirect: 'manual',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(18_000)]),
    } satisfies RequestInit & { cf: { cacheTtlByStatus: Record<string, number> } };
    const response = await fetch(API + path, options);
    if (!response.ok) {
      const status = response.status;
      // Tells the browser that Strava, not this site's session check, refused the token.
      const reason = status === 401 ? { 'X-Wornways-Strava-Reason': 'strava-rejected' } : {};
      return new Response(null, {
        status: status === 401 || status === 429 || (track && status === 404) ? status : 502,
        headers: { ...headers, ...reason },
      });
    }
    // The upstream request fixes the GPS fields. Stream the arrays without buffering them.
    if (track)
      return new Response(response.body, {
        headers: { ...headers, 'Content-Type': 'application/json' },
      });

    const rows = (await response.json()) as Summary[];
    return Response.json(rows.map(replaySummary), { headers });
  } catch {
    return new Response(null, { status: 502, headers });
  }
}
