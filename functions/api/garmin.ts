// A same-origin relay for a deployment operated by the owner of the Personal API key.
// Garmin's Personal API does not accept cross-origin requests from the browser.
const GARMIN = 'https://personal.connectapi.garmin.com';
const TOKEN_PATH = '/personalapitoken-service/personal-api/personal-api-key/token';
const SEARCH_PATH = '/activitylist-service/activities/search/activities';
const DOWNLOAD_PATH = '/download-service/files/activity/';
const SESSION_MS = 2 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30_000;
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const privateHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

type Context = { request: Request; env: { GARMIN_PERSONAL_ENABLED?: string } };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: privateHeaders });
}

function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const millis = Date.parse(date);
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === date;
}

function activityQuery(params: URLSearchParams): string | null {
  const query = new URLSearchParams();
  for (const [name, value] of params) {
    if (query.has(name)) return null;
    if (name === 'start' || name === 'limit') {
      if (!/^\d+$/.test(value)) return null;
      const number = Number(value);
      if (name === 'start' ? number > 2_147_483_647 : number < 1 || number > 99) return null;
      query.set(name, String(number));
    } else if (name === 'startDate' || name === 'endDate') {
      if (!validDate(value)) return null;
      query.set(name, value);
    } else return null;
  }
  const start = query.get('startDate');
  const end = query.get('endDate');
  return start && end && start > end ? null : query.toString();
}

function fetchGarmin(path: string, method: string, authorization: string, signal: AbortSignal) {
  return fetch(GARMIN + path, {
    method,
    headers: { Authorization: authorization, Accept: '*/*' },
    cache: 'no-store',
    // Workers supports manual redirects. A redirect fails the same checks as any non-2xx.
    redirect: 'manual',
    signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  });
}

// The expiry only bounds Wornways' in-memory session. Garmin validates the bearer token.
function tokenExpiry(token: string, now: number): number {
  if (token.length > 4096 || !JWT.test(token)) return NaN;
  const payload = token.split('.')[1]!.replaceAll('-', '+').replaceAll('_', '/');
  const { exp } = JSON.parse(atob(payload)) as { exp?: unknown };
  return typeof exp === 'number' && Number.isFinite(exp)
    ? Math.min(exp * 1000, now + SESSION_MS)
    : NaN;
}

async function authorize(request: Request, url: URL): Promise<Response> {
  if (request.headers.get('Origin') !== url.origin) return error('Request origin is invalid.', 403);
  if (url.searchParams.size || request.headers.get('Content-Type') !== 'application/json')
    return error('Enter a Garmin Connect Personal API key.', 400);

  const body = (await request.json().catch(() => null)) as { key?: unknown } | null;
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  if (!/^[\x21-\x7e]{1,512}$/.test(key))
    return error('Enter a Garmin Connect Personal API key.', 400);

  const response = await fetchGarmin(TOKEN_PATH, 'POST', `ApiKey ${key}`, request.signal);
  if (response.status === 429)
    return error('Garmin Connect is rate limiting requests. Try again later.', 429);
  if ([401, 403, 404].includes(response.status))
    return error('Garmin Connect did not accept this Personal API key.', 401);
  if (!response.ok) return error('Garmin Connect could not sign in. Try again.', 502);

  const token = (await response.text()).trim();
  const now = Date.now();
  const expiresAt = tokenExpiry(token, now);
  if (!(expiresAt > now)) return error('Garmin Connect did not return a usable session.', 502);
  return json({ token, expiresAt });
}

async function readActivities(request: Request, params: URLSearchParams): Promise<Response> {
  const authorization = request.headers.get('Authorization') ?? '';
  if (
    authorization.length > 4103 ||
    !authorization.startsWith('Bearer ') ||
    !JWT.test(authorization.slice(7))
  )
    return error('Connect with Garmin again.', 401);

  const id = params.get('activity');
  let path: string;
  if (id !== null) {
    if (params.size !== 1 || !/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9_223_372_036_854_775_807n)
      return error('This Garmin activity ID is invalid.', 400);
    path = DOWNLOAD_PATH + id;
  } else {
    const query = activityQuery(params);
    if (query === null) return error('This Garmin activity search is invalid.', 400);
    path = `${SEARCH_PATH}?${query}`;
  }

  const response = await fetchGarmin(path, 'GET', authorization, request.signal);
  if (response.status === 401 || response.status === 403)
    return error('Connect with Garmin again.', 401);
  if (response.status === 429)
    return error('Garmin Connect is rate limiting requests. Try again later.', 429);
  if (id !== null && response.status === 404)
    return error('This Garmin activity file is unavailable.', 404);
  if (!response.ok || !response.body)
    return error('Garmin Connect could not return the activities. Try again.', 502);
  return new Response(response.body, {
    headers: {
      ...privateHeaders,
      'Content-Type': id === null ? 'application/json' : 'application/octet-stream',
    },
  });
}

export async function onRequest({ request, env }: Context): Promise<Response> {
  if (env.GARMIN_PERSONAL_ENABLED !== '1')
    return error('Garmin Connect is unavailable on this site.', 404);
  const url = new URL(request.url);
  try {
    if (request.method === 'POST') return await authorize(request, url);
    if (request.method !== 'GET') return error('This request method is unsupported.', 405);
    if (url.searchParams.size === 0) return json({ available: true });
    return await readActivities(request, url.searchParams);
  } catch {
    return error('Garmin Connect could not complete the request. Try again.', 502);
  }
}
