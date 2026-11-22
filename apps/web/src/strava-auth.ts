const ENDPOINT = '/api/strava/oauth';
const STATE = 'wornways-strava-state';

import type { StravaGrant } from './messages.ts';

export type { StravaGrant };

type StravaConfiguration = { clientId?: string; session?: StravaGrant };

export async function stravaConfiguration(): Promise<StravaConfiguration> {
  try {
    const res = await fetch(ENDPOINT, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!res.ok || !res.headers.get('Content-Type')?.includes('application/json')) return {};
    return (await res.json()) as StravaConfiguration;
  } catch {
    return {};
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

/**
 * Whether a sign-in started in this tab is still waiting for Strava's answer, and forgets it.
 * Ask only when the address holds no callback: the person then came back from Strava's page
 * without Strava sending them back. Strava shows some refusals, like its limit of connected
 * athletes, on its own page and never sends the person back.
 */
export function takeUnansweredStravaSignIn(): boolean {
  try {
    const started = sessionStorage.getItem(STATE) !== null;
    sessionStorage.removeItem(STATE);
    return started;
  } catch {
    return false;
  }
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
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? 'The Wornways server sent an unexpected answer. Try again.');
  }
  return res;
}

export async function finishStravaAuthorization(params: URLSearchParams): Promise<StravaGrant> {
  const state = sessionStorage.getItem(STATE);
  sessionStorage.removeItem(STATE);
  if (!state || params.get('state') !== state)
    throw new Error('This Strava sign-in expired or was started in another tab. Connect again.');
  const authorizationError = params.get('error');
  if (authorizationError === 'access_denied') throw new Error('Strava access was canceled.');
  if (authorizationError)
    throw new Error('Strava could not connect. You can still use activity files.');
  const scopes = params.get('scope')?.split(/[, ]+/) ?? [];
  if (!scopes.some((scope) => scope === 'activity:read' || scope === 'activity:read_all'))
    throw new Error('Allow Wornways to read your Strava activities, then connect again.');
  const res = await oauthRequest('POST', { code: params.get('code') });
  const grant = (await res.json()) as StravaGrant;
  if (
    !grant.cacheKey ||
    !grant.sessionId ||
    !Number.isFinite(grant.expiresAt) ||
    grant.expiresAt <= Date.now()
  )
    throw new Error('Wornways received an unusable Strava session. Connect again.');
  return grant;
}

export async function clearStravaAccess(sessionId: string, disconnect: boolean): Promise<void> {
  await oauthRequest('DELETE', { sessionId, disconnect });
}
