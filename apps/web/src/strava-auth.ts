const ENDPOINT = '/api/strava/oauth';
const STATE = 'wornways-strava-state';

export type StravaGrant = { token: string; expiresAt: number };

export async function stravaClientId(): Promise<string | null> {
  try {
    const res = await fetch(ENDPOINT, { cache: 'no-store' });
    if (!res.ok || !res.headers.get('Content-Type')?.includes('application/json')) return null;
    const data = (await res.json()) as { clientId?: string };
    return data.clientId ?? null;
  } catch {
    return null;
  }
}

export function stravaAuthorization(clientId: string): URL {
  const url = new URL('https://www.strava.com/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: location.origin + '/',
    approval_prompt: 'auto',
    scope: 'activity:read_all',
    state: crypto.randomUUID(),
  }).toString();
  return url;
}

export function rememberStravaState(url: URL): void {
  sessionStorage.setItem(STATE, url.searchParams.get('state') ?? '');
}

export function takeStravaCallback(): URLSearchParams | null {
  const url = new URL(location.href);
  const params = new URLSearchParams(url.search);
  if (!params.has('state') || !(params.has('code') || params.has('error'))) return null;
  for (const key of ['state', 'code', 'scope', 'error', 'error_description'])
    url.searchParams.delete(key);
  history.replaceState(history.state, '', url);
  return params;
}

async function oauthRequest(method: 'POST' | 'DELETE', body: object): Promise<Response> {
  const res = await fetch(ENDPOINT, {
    method,
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? 'Strava could not complete the request. Try again.');
  }
  return res;
}

export async function finishStravaAuthorization(
  params: URLSearchParams,
): Promise<StravaGrant & { ticket: string }> {
  const state = sessionStorage.getItem(STATE);
  sessionStorage.removeItem(STATE);
  if (!state || params.get('state') !== state)
    throw new Error('The Strava sign-in expired. Connect again.');
  if (params.has('error')) throw new Error('Strava access was canceled.');
  const scopes = params.get('scope')?.split(/[, ]+/) ?? [];
  if (!scopes.some((scope) => scope === 'activity:read' || scope === 'activity:read_all'))
    throw new Error('Allow Wornways to read your Strava activities, then connect again.');
  const res = await oauthRequest('POST', { code: params.get('code') });
  const grant = (await res.json()) as StravaGrant & { ticket: string };
  if (
    !grant.token ||
    !grant.ticket ||
    !Number.isFinite(grant.expiresAt) ||
    grant.expiresAt <= Date.now()
  )
    throw new Error('The Strava sign-in expired. Connect again.');
  return grant;
}

export async function revokeStravaAccess(token: string): Promise<void> {
  await oauthRequest('DELETE', { token });
}
