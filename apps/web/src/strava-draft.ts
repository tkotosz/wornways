import type { Adjustments } from './adjust.ts';
import type { Choice } from './choice.ts';
import type { StravaGrant } from './strava-auth.ts';

const DRAFT = 'wornways-strava-draft';
const ENDED = 'wornways-strava-ended';
const encoder = new TextEncoder();

type Draft = {
  choice: Omit<Choice, 'excluded'>;
  selected: string[];
  adjustments: Adjustments;
};

export type StravaDraftStore = {
  save: (draft: Draft) => Promise<void>;
  end: () => void;
};

function stored(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Draft restoration is optional when browser storage is blocked or full.
  }
}

export function clearStravaDraft(): void {
  store(DRAFT, null);
}

export async function openStravaDraft(
  grant: StravaGrant,
  fresh: boolean,
): Promise<(StravaDraftStore & { draft: Draft | null }) | null> {
  if (fresh) {
    clearStravaDraft();
    store(ENDED, null);
  }

  const material = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(DRAFT + ':' + grant.sessionId + ':' + (grant.cacheKey ?? grant.token)),
  );
  const key = await crypto.subtle.importKey('raw', material, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);

  async function encrypt(slot: string, value: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(slot) },
      key,
      encoder.encode(value),
    );
    let bytes = String.fromCharCode(...iv);
    for (const byte of new Uint8Array(ciphertext)) bytes += String.fromCharCode(byte);
    return btoa(bytes);
  }

  async function decrypt(slot: string, value: string): Promise<string | null> {
    try {
      const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: encoder.encode(slot) },
        key,
        bytes.subarray(12),
      );
      return new TextDecoder().decode(plaintext);
    } catch {
      return null;
    }
  }

  // Prepare the marker so ending a replay can clear the draft synchronously, even offline.
  const marker = await encrypt(ENDED, 'ended');
  let revision = 0;
  function end(): void {
    ++revision;
    clearStravaDraft();
    store(ENDED, marker);
  }

  async function save(draft: Draft): Promise<void> {
    const saving = ++revision;
    try {
      const ciphertext = await encrypt(DRAFT, JSON.stringify(draft));
      if (saving === revision) store(DRAFT, ciphertext);
    } catch {
      // Keep the last saved draft if encryption fails.
    }
  }

  const ended = stored(ENDED);
  if (ended === grant.sessionId) {
    end();
    return null;
  }
  if (ended) {
    if ((await decrypt(ENDED, ended)) === 'ended') {
      clearStravaDraft();
      return null;
    }
    store(ENDED, null);
  }

  const previous = stored(DRAFT);
  let draft: Draft | null = null;
  if (previous?.startsWith('{')) {
    // Migrate drafts written by older previews of the same Strava session.
    clearStravaDraft();
    try {
      const { sessionId, ...legacy } = JSON.parse(previous) as Draft & { sessionId: string };
      if (sessionId === grant.sessionId) {
        draft = legacy;
        await save(draft);
      }
    } catch {
      // A malformed draft can be discarded.
    }
  } else if (previous) {
    const plaintext = await decrypt(DRAFT, previous);
    if (plaintext) draft = JSON.parse(plaintext) as Draft;
    else clearStravaDraft();
  }

  return { draft, save, end };
}
