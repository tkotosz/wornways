// The browser keeps the short-lived OAuth session. AES-GCM protects the contents
// and binds the cookie to this deployment origin. There is no server-side session store.
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

const bytes = new TextEncoder();
const base64url = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromBase64url = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));

async function key(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    'SHA-256',
    bytes.encode('wornways-strava-cookie:' + secret),
  );
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function sessionCookie(
  session: StravaSession,
  secret: string,
  origin: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: bytes.encode(origin) },
    await key(secret),
    bytes.encode(JSON.stringify(session)),
  );
  const age = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
  return (
    NAME +
    '=' +
    base64url(iv) +
    '.' +
    base64url(new Uint8Array(encrypted)) +
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
  const cookie = request.headers
    .get('Cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(name + '='));
  const [iv, data, extra] = cookie?.slice(name.length + 1).split('.') ?? [];
  if (!iv || !data || extra !== undefined || data.length > 3000) return null;
  try {
    const decoded = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64url(iv), additionalData: bytes.encode(origin) },
      await key(secret),
      fromBase64url(data),
    );
    const session = JSON.parse(new TextDecoder().decode(decoded)) as StravaSession;
    return session.expiresAt > Date.now() &&
      session.token &&
      session.ticket &&
      session.sessionId &&
      session.cacheKey
      ? session
      : null;
  } catch {
    return null;
  }
}

export const expiredSessionCookie = NAME + '=; ' + ATTRIBUTES + '; Max-Age=0';
export const expiredLegacyCookie = `${LEGACY}=; Path=/api/strava/oauth; ${FLAGS}; Max-Age=0`;

export function readLegacySession(request: Request, secret: string, origin: string) {
  return readSession(request, secret, origin, LEGACY);
}
