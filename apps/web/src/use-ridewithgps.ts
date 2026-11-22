// Ride with GPS as a source on the page: whether the site offers it, whether this browser is
// connected, and, while it is the source, the account's trips, the choice over them and
// fetching the chosen trips' tracks. The sign-in runs in the site's Functions
// (functions/api/ridewithgps): the page links to /api/ridewithgps/connect, and the callback
// sends the person back with `?ridewithgps=<outcome>`.
//
// The connection lasts 30 days. The app reopens Ride with GPS after a reload when it was the
// source last; the choice is kept for the tab, like Strava's.

import { ref, watch } from 'vue';
import { NO_CHOICE, type Choice } from './choice.ts';
import { Canceled, RideWithGpsDisconnected, type EngineClient } from './engine-client.ts';
import type { ActivitySummary } from './messages.ts';
import { useMatches } from './use-matches.ts';

export const CONNECT_URL = '/api/ridewithgps/connect';
const SESSION_URL = '/api/ridewithgps/session';
/** Set while Ride with GPS is the source, so a reload opens it again. */
const LAST_SOURCE = 'wornways-rwgps-source';
/** The choice over the trips, for the tab's next reload. */
const CHOICE = 'wornways-rwgps-choice';

const OUTCOMES: Record<string, string> = {
  canceled: 'Ride with GPS access was canceled.',
  expired: 'This Ride with GPS sign-in expired or was started in another browser. Connect again.',
  failed: 'Ride with GPS could not connect. Try again, or use activity files.',
};

/** How the sign-in that sent the person back here went; takes it out of the address. */
function takeOutcome(): string | null {
  const url = new URL(location.href);
  const outcome = url.searchParams.get('ridewithgps');
  if (outcome === null) return null;
  url.searchParams.delete('ridewithgps');
  history.replaceState(history.state, '', url);
  return outcome;
}

function stored(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function store(storage: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // Remembering is optional when browser storage is blocked or full.
  }
}

const initialChoice = (): Choice => ({ ...NO_CHOICE, period: 'this-month' });

function restoredChoice(): Choice {
  try {
    const saved = JSON.parse(stored(() => sessionStorage, CHOICE) ?? 'null') as Choice | null;
    return saved ? { ...initialChoice(), ...saved } : initialChoice();
  } catch {
    return initialChoice();
  }
}

const message = (caught: unknown) => (caught instanceof Error ? caught.message : String(caught));

export function useRideWithGps(engine: EngineClient, onEnd: () => void) {
  /** Whether this site offers Ride with GPS; false until checked. */
  const available = ref(false);
  const connected = ref(false);
  /** Whether Ride with GPS is the source. */
  const active = ref(false);
  const busy = ref('');
  const error = ref('');
  const notice = ref('');
  const rows = ref<ActivitySummary[]>([]);
  const choice = ref<Choice>(restoredChoice());
  const { matches, matching } = useMatches(engine, 'rwgps', choice, rows);

  /** Ends being the source, after the connection ended or on disconnect. */
  async function stop(forget: boolean): Promise<void> {
    const wasActive = active.value;
    active.value = false;
    rows.value = [];
    store(() => localStorage, LAST_SOURCE, null);
    store(() => sessionStorage, CHOICE, null);
    choice.value = initialChoice();
    await engine.endRideWithGps(forget).catch(() => {});
    if (wasActive) onEnd();
  }

  function failed(caught: unknown): void {
    if (caught instanceof Canceled) return;
    error.value = message(caught);
    if (caught instanceof RideWithGpsDisconnected) {
      connected.value = false;
      void stop(true);
    }
  }

  /**
   * Checks the connection. Returns why Ride with GPS should open as the source: "connected"
   * right after connecting, "reopen" when it was the source before this reload; else null.
   */
  async function check(): Promise<'connected' | 'reopen' | null> {
    const outcome = takeOutcome();
    if (outcome && OUTCOMES[outcome]) error.value = OUTCOMES[outcome];
    try {
      const res = await fetch(SESSION_URL, {
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok || !res.headers.get('Content-Type')?.includes('application/json')) return null;
      available.value = true;
      connected.value = ((await res.json()) as { connected?: boolean }).connected === true;
    } catch {
      return null;
    }
    if (!connected.value) {
      // The connection ended while the app was closed: tracks kept for it go too.
      if (stored(() => localStorage, LAST_SOURCE)) await stop(true);
      return null;
    }
    if (outcome === 'connected') return 'connected';
    return stored(() => localStorage, LAST_SOURCE) === 'open' ? 'reopen' : null;
  }

  /** Makes Ride with GPS the source and lists the account's trips. */
  async function open(): Promise<boolean> {
    error.value = '';
    notice.value = '';
    busy.value = 'Reading your Ride with GPS trips…';
    try {
      rows.value = await engine.startRideWithGps();
      active.value = true;
      store(() => localStorage, LAST_SOURCE, 'open');
      if (!rows.value.length)
        notice.value = 'Your Ride with GPS account has no trips with a route.';
      return true;
    } catch (caught) {
      failed(caught);
      return false;
    } finally {
      busy.value = '';
    }
  }

  /** Goes back to another source; the connection and the downloaded tracks stay. */
  async function close(): Promise<void> {
    store(() => localStorage, LAST_SOURCE, null);
    if (!active.value) return;
    active.value = false;
    rows.value = [];
    await engine.endRideWithGps(false).catch(() => {});
  }

  /** Fetches the chosen trips' tracks before going on; false when that did not work out. */
  async function prepare(ids: string[]): Promise<boolean> {
    if (!active.value) return false;
    error.value = '';
    notice.value = '';
    busy.value = 'Fetching tracks from Ride with GPS…';
    try {
      const missing = await engine.prepareRideWithGps(ids, (p) => {
        if (p.total)
          busy.value = `Fetching tracks from Ride with GPS: ${p.done ?? 0} of ${p.total}…`;
      });
      if (missing.length) {
        const unavailable = new Set(missing);
        rows.value = rows.value.filter((row) => !unavailable.has(row.id));
        notice.value =
          'Some selected trips had no usable GPS track and were removed from the list.';
      }
      return missing.length === 0;
    } catch (caught) {
      failed(caught);
      return false;
    } finally {
      busy.value = '';
    }
  }

  async function disconnect(): Promise<boolean> {
    error.value = '';
    busy.value = 'Disconnecting Ride with GPS…';
    try {
      const res = await fetch(SESSION_URL, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
        body: '{}',
      });
      // The cookie ends even when Ride with GPS could not revoke the token.
      connected.value = false;
      await stop(true);
      if (!res.ok)
        error.value =
          'Ride with GPS could not revoke access. You can remove Wornways in your Ride with GPS settings.';
      return true;
    } catch {
      error.value = 'Could not disconnect Ride with GPS. Try again when online.';
      return false;
    } finally {
      busy.value = '';
    }
  }

  // Trips ticked again are fetched first.
  watch(
    () => choice.value.excluded,
    (after, before) => {
      if (!active.value) return;
      const unticked = new Set(after);
      const ticked = before.filter((id) => !unticked.has(id));
      if (ticked.length) engine.prioritizeRideWithGps(ticked);
    },
  );
  watch(
    choice,
    () => {
      if (active.value) store(() => sessionStorage, CHOICE, JSON.stringify(choice.value));
    },
    { deep: true },
  );

  return {
    available,
    connected,
    active,
    busy,
    error,
    notice,
    rows,
    choice,
    matches,
    matching,
    check,
    open,
    close,
    prepare,
    disconnect,
  };
}
