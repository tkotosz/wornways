// A relay ticket contains a pseudonymous channel and expiry, authenticated by the
// client secret. The athlete ID and OAuth token never go to the event relay.
export type StravaEnv = {
  STRAVA_CLIENT_ID?: string;
  STRAVA_CLIENT_SECRET?: string;
  STRAVA_ORIGIN?: string;
  STRAVA_WEBHOOK_TOKEN?: string;
  STRAVA_EVENTS?: {
    idFromName(name: string): object;
    get(id: object): { fetch(request: Request): Promise<Response> };
  };
};

export function stravaReady(env: StravaEnv, origin: string) {
  return !!(
    env.STRAVA_CLIENT_ID &&
    env.STRAVA_CLIENT_SECRET &&
    env.STRAVA_WEBHOOK_TOKEN &&
    env.STRAVA_EVENTS &&
    origin === env.STRAVA_ORIGIN
  );
}

const encode = (value: string) => new TextEncoder().encode(value);
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function channelFor(secret: string, athlete: string): Promise<string> {
  return hex(await crypto.subtle.sign('HMAC', await key(secret), encode('athlete:' + athlete)));
}

export async function makeTicket(secret: string, athlete: string, expiry: number): Promise<string> {
  const channel = await channelFor(secret, athlete);
  const body = channel + '.' + expiry;
  return (
    body + '.' + hex(await crypto.subtle.sign('HMAC', await key(secret), encode('relay:' + body)))
  );
}

export async function ticketChannel(secret: string, ticket: string): Promise<string | null> {
  const match = /^([a-f0-9]{64})\.(\d{13})\.([a-f0-9]{64})$/.exec(ticket);
  if (!match) return null;
  const [, channel, expiry, tag] = match;
  if (Number(expiry) <= Date.now()) return null;
  const bytes = Uint8Array.from(tag!.match(/../g)!, (pair) => Number.parseInt(pair, 16));
  const authentic = await crypto.subtle.verify(
    'HMAC',
    await key(secret),
    bytes,
    encode('relay:' + channel + '.' + expiry),
  );
  return authentic ? channel! : null;
}
