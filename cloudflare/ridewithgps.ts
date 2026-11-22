// The Ride with GPS connection's server side. The browser keeps the access token in a sealed
// cookie (see sealed-cookie.ts) that page scripts cannot read; there is no server-side store.
// Ride with GPS tokens do not expire and can also change the account, so only these
// Functions ever hold one, and they only read.
import { seal, unseal } from './sealed-cookie.ts';

export type RideWithGpsEnv = {
  RWGPS_CLIENT_ID?: string;
  RWGPS_CLIENT_SECRET?: string;
  RWGPS_ORIGIN?: string;
};

export const RWGPS = 'https://ridewithgps.com';

/** Whether this deployment offers Ride with GPS: it has an API client and runs at its origin. */
export function rideWithGpsReady(env: RideWithGpsEnv, origin: string): boolean {
  return !!(env.RWGPS_CLIENT_ID && env.RWGPS_CLIENT_SECRET && origin === env.RWGPS_ORIGIN);
}

/** Where Ride with GPS sends the person back to; registered as the API client's redirect URI. */
export const callbackUrl = (origin: string) => origin + '/api/ridewithgps/callback';

/** How long the connection lasts before the person has to connect again. */
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION = '__Secure-wornways-rwgps-session';
const SESSION_ATTRIBUTES = 'Path=/api/ridewithgps; Secure; HttpOnly; SameSite=Strict';
const LABEL = 'wornways-rwgps-cookie';

export type RideWithGpsSession = { token: string; expiresAt: number };

export async function sessionCookie(
  session: RideWithGpsSession,
  secret: string,
  origin: string,
): Promise<string> {
  const age = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
  const value = await seal(session, secret, LABEL, origin);
  return `${SESSION}=${value}; ${SESSION_ATTRIBUTES}; Max-Age=${age}`;
}

export async function readSession(
  request: Request,
  secret: string,
  origin: string,
): Promise<RideWithGpsSession | null> {
  const session = (await unseal(
    request,
    SESSION,
    secret,
    LABEL,
    origin,
  )) as RideWithGpsSession | null;
  return session && typeof session.token === 'string' && session.expiresAt > Date.now()
    ? session
    : null;
}

export const expiredSessionCookie = `${SESSION}=; ${SESSION_ATTRIBUTES}; Max-Age=0`;

// The sign-in's state travels in a cookie of its own. It must come back on the redirect from
// ridewithgps.com, a navigation from another site, so it is SameSite=Lax, not Strict.
const STATE = '__Secure-wornways-rwgps-state';
const STATE_ATTRIBUTES = 'Path=/api/ridewithgps/callback; Secure; HttpOnly; SameSite=Lax';
const STATE_SECONDS = 10 * 60;

export function stateCookie(state: string): string {
  return `${STATE}=${state}; ${STATE_ATTRIBUTES}; Max-Age=${STATE_SECONDS}`;
}

export function readState(request: Request): string | null {
  const cookie = request.headers
    .get('Cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(STATE + '='));
  const value = cookie?.slice(STATE.length + 1);
  return value && /^[0-9a-f-]{36}$/.test(value) ? value : null;
}

export const expiredStateCookie = `${STATE}=; ${STATE_ATTRIBUTES}; Max-Age=0`;

export const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
