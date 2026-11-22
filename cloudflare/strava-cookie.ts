// The browser keeps the short-lived OAuth session. AES-GCM protects the contents
// and binds the cookie to this deployment origin. There is no server-side session store.
import { seal, unseal } from './sealed-cookie.ts';

const NAME = '__Secure-wornways-strava-session';
const LEGACY = '__Secure-wornways-strava';
const FLAGS = 'Secure; HttpOnly; SameSite=Strict';
const ATTRIBUTES = `Path=/api/strava; ${FLAGS}`;
export const STRAVA_SESSION_MS = 2 * 60 * 60 * 1000;

export type StravaSession = {
  token: string;
  expiresAt: number;
  ticket: string;
  sessionId: string;
  cacheKey: string;
};

/** Cache metadata is separate from the credentials sealed in the cookie. */
export function sessionInfo({ expiresAt, sessionId, cacheKey }: StravaSession) {
  return { expiresAt, sessionId, cacheKey };
}

const LABEL = 'wornways-strava-cookie';

export async function sessionCookie(
  session: StravaSession,
  secret: string,
  origin: string,
): Promise<string> {
  const age = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
  return (
    NAME +
    '=' +
    (await seal(session, secret, LABEL, origin)) +
    '; ' +
    ATTRIBUTES +
    '; Max-Age=' +
    age
  );
}

export async function readSession(
  request: Request,
  secret: string,
  origin: string,
  name = NAME,
): Promise<StravaSession | null> {
  const session = (await unseal(request, name, secret, LABEL, origin)) as StravaSession | null;
  return session &&
    session.expiresAt > Date.now() &&
    session.token &&
    session.ticket &&
    session.sessionId &&
    session.cacheKey
    ? session
    : null;
}

export const expiredSessionCookie = NAME + '=; ' + ATTRIBUTES + '; Max-Age=0';
export const expiredLegacyCookie = `${LEGACY}=; Path=/api/strava/oauth; ${FLAGS}; Max-Age=0`;

export function readLegacySession(request: Request, secret: string, origin: string) {
  return readSession(request, secret, origin, LEGACY);
}
