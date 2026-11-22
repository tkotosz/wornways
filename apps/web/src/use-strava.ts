import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { fromEarlierVersions, type Adjustments } from './adjust.ts';
import { NO_CHOICE, filterSettings, periodRange, type Choice } from './choice.ts';
import {
  Canceled,
  StravaExpired,
  type DownloadProgress,
  type EngineClient,
} from './engine-client.ts';
import type { ActivitySummary, MatchReport } from './messages.ts';
import {
  finishStravaAuthorization,
  stravaAuthorization,
  stravaConfiguration,
  takeStravaCallback,
  type StravaGrant,
} from './strava-auth.ts';
import { clearStravaDraft, openStravaDraft, type StravaDraftStore } from './strava-draft.ts';

const initialChoice = (): Choice => ({ ...NO_CHOICE, period: 'this-month' });

export function useStrava(
  engine: EngineClient,
  adjustments: Ref<Adjustments>,
  onEnd: () => void,
  onRevalidate: () => void,
) {
  const active = ref(false);
  const ready = ref(false);
  const choice = ref<Choice>(initialChoice());
  const rows = ref<ActivitySummary[]>([]);
  const url = ref<URL | null>(null);
  const error = ref('');
  const busy = ref('');
  const notice = ref('');
  const selection = ref<MatchReport>({ ids: [], problem: null });
  /** Whether the filters changed and the worker has not answered yet. */
  const matching = ref(false);
  let callback = takeStravaCallback();
  let session: (Pick<StravaGrant, 'sessionId' | 'expiresAt'> & StravaDraftStore) | null = null;
  let initialSelection: string[] = [];
  const range = computed(() => periodRange(choice.value, new Date()));
  let revision = 0;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let socket: WebSocket | null = null;

  const matched = computed<MatchReport>(() => ({
    ids: ready.value ? selection.value.ids : [],
    problem: error.value || selection.value.problem,
  }));

  function selected() {
    const excluded = new Set(choice.value.excluded);
    return rows.value.filter((row) => !excluded.has(row.id)).map((row) => row.id);
  }

  function failed(caught: unknown) {
    if (caught instanceof Canceled) return;
    if (caught instanceof StravaExpired) void end();
    error.value = caught instanceof Error ? caught.message : String(caught);
  }

  /**
   * When the Strava connection ends, also while Strava is not the source; null when not
   * connected. Switching to another source keeps it.
   */
  const until = ref<number | null>(null);
  /** Whether the person just came back from Strava's sign-in page. */
  const returning = callback !== null;

  /**
   * Reads whether this browser is connected to Strava, without opening it as the source.
   * Returns the connection, so what it keeps on this device can be counted.
   */
  async function status(): Promise<StravaGrant | null> {
    const config = await stravaConfiguration();
    if (config.clientId) url.value = stravaAuthorization(config.clientId);
    const session = config.session;
    until.value = session && session.expiresAt > Date.now() ? session.expiresAt : null;
    return until.value ? session! : null;
  }

  /** Stops being the source; the connection and its cached tracks stay for their two hours. */
  async function close(): Promise<void> {
    if (!session) return;
    ++revision;
    session = null;
    clearTimeout(expiry);
    closeEvents();
    active.value = false;
    ready.value = false;
    rows.value = [];
    selection.value = { ids: [], problem: null };
    choice.value = initialChoice();
    error.value = '';
    busy.value = '';
    notice.value = '';
    await engine.closeStrava().catch(() => {});
  }

  /** Ends the connection, also one that is not the source (Disconnect on its screen). */
  async function end(disconnect = false): Promise<boolean> {
    if (!session && !until.value) return false;
    const ended = ++revision;
    if (session) session.end();
    else clearStravaDraft();
    session = null;
    until.value = null;
    clearTimeout(expiry);
    closeEvents();
    active.value = false;
    ready.value = false;
    rows.value = [];
    selection.value = { ids: [], problem: null };
    choice.value = initialChoice();
    error.value = '';
    busy.value = '';
    notice.value = '';
    onEnd();
    try {
      await engine.endStrava(disconnect);
      return revision === ended;
    } catch (caught) {
      if (revision === ended && (!error.value || disconnect)) failed(caught);
      return false;
    }
  }

  async function connect(defaultAdjustments: Adjustments) {
    const params = callback;
    callback = null;
    if (params) busy.value = 'Connecting to Strava…';
    try {
      const config = await stravaConfiguration();
      if (config.clientId) url.value = stravaAuthorization(config.clientId);
      const login = params ? await finishStravaAuthorization(params) : config.session;
      if (!login || login.expiresAt <= Date.now()) {
        clearStravaDraft();
        until.value = null;
        return false;
      }
      const storage = await openStravaDraft(login, params !== null);
      if (!storage) return false;
      const { expiresAt, sessionId, cacheKey } = login;
      await engine.startStrava({ expiresAt, sessionId, cacheKey });
      const { draft, ...draftStore } = storage;
      session = { expiresAt, sessionId, ...draftStore };
      choice.value = { ...initialChoice(), ...draft?.choice };
      adjustments.value = fromEarlierVersions(draft?.adjustments ?? defaultAdjustments);
      initialSelection = draft?.selected ?? [];
      active.value = true;
      until.value = expiresAt;
      expiry = setTimeout(expired, expiresAt - Date.now());
      return true;
    } catch (caught) {
      failed(caught);
      return false;
    } finally {
      busy.value = '';
    }
  }

  function expired() {
    failed(new StravaExpired('Your Strava session expired. Connect again.'));
  }

  function closeEvents() {
    const events = socket;
    socket = null;
    events?.close();
  }

  async function openEvents(sessionId: string): Promise<void> {
    const endpoint = new URL('/api/strava/events', location.origin);
    endpoint.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const events = new WebSocket(endpoint, 'session.' + sessionId);
    socket = events;
    events.addEventListener('message', ({ data }) => {
      if (socket !== events) return;
      if (data === 'revoked')
        failed(new StravaExpired('Strava access was revoked. Temporary activities were cleared.'));
      if (data === 'activity') {
        onRevalidate();
        void list(selected(), true);
      }
    });
    events.addEventListener('close', () => {
      if (socket !== events || !ready.value) return;
      socket = null;
      ready.value = false;
      ++revision;
      onRevalidate();
      void resume();
    });
    await new Promise<void>((resolve, reject) => {
      const unavailable = () => {
        clearTimeout(timer);
        reject(new Error('Could not open the Strava update connection. Try again when online.'));
      };
      const timer = setTimeout(unavailable, 8000);
      events.addEventListener(
        'open',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      events.addEventListener('error', unavailable, { once: true });
      events.addEventListener('close', unavailable, { once: true });
    });
    if (socket !== events || events.readyState !== WebSocket.OPEN)
      throw new Error('The Strava update connection closed right after opening. Try again.');
  }

  async function resume() {
    if (!session || document.hidden || ready.value || socket) return;
    if (session.expiresAt <= Date.now()) {
      expired();
      return;
    }
    const attempt = session;
    busy.value = 'Connecting to Strava…';
    try {
      await openEvents(attempt.sessionId);
      if (session !== attempt) return;
      ready.value = true;
      const keep = rows.value.length ? selected() : initialSelection;
      initialSelection = [];
      await list(keep);
    } catch (caught) {
      if (session !== attempt) return;
      closeEvents();
      const config = await stravaConfiguration();
      if (session !== attempt) return;
      if (config.clientId && config.session?.sessionId !== attempt.sessionId) {
        failed(new StravaExpired('Your Strava session ended while reconnecting. Connect again.'));
        return;
      }
      busy.value = '';
      failed(caught);
    }
  }

  async function list(keep: string[] = [], activityChanged = false) {
    if (!active.value || !ready.value) return;
    const request = ++revision;
    const from = range.value?.from;
    const to = range.value?.to;
    rows.value = [];
    selection.value = { ids: [], problem: null };
    notice.value = '';
    busy.value = '';
    error.value = '';
    choice.value = { ...choice.value, excluded: [] };

    if (from == null || to == null) {
      error.value = 'Choose a start and end date for your Strava activities.';
      await engine.listStrava(null, null, activityChanged).catch(() => {});
      return;
    }

    busy.value = 'Finding activities on Strava…';
    const remembered = new Set(keep);
    try {
      const activities = await engine.listStrava(from, to, activityChanged);
      if (request !== revision) return;
      choice.value = {
        ...choice.value,
        excluded: activities.filter((row) => !remembered.has(row.id)).map((row) => row.id),
      };
      rows.value = activities;
      if (!activities.length) notice.value = 'No Strava activities in this period.';
    } catch (caught) {
      if (request === revision) {
        initialSelection = keep;
        failed(caught);
      }
    } finally {
      if (request === revision) busy.value = '';
    }
  }

  function retry() {
    if (ready.value) void list(rows.value.length ? selected() : initialSelection);
    else void resume();
  }

  /** Tracks being downloaded before going on; null when none are. */
  const download = ref<DownloadProgress | null>(null);

  async function prepare(ids: string[]) {
    if (!ready.value) return false;
    const request = revision;
    busy.value = 'Loading selected tracks…';
    error.value = '';
    notice.value = '';
    const task = engine.prepareStrava(ids, ({ done = 0, total = ids.length }) => {
      if (download.value) download.value = { ...download.value, done, total };
    });
    download.value = { done: 0, total: ids.length, cancel: task.cancel };
    try {
      const missing = await task.result;
      if (request !== revision) return false;
      if (missing.length) {
        const unavailable = new Set(missing);
        rows.value = rows.value.filter((row) => !unavailable.has(row.id));
        notice.value =
          'Some selected activities had no usable GPS track and were removed from the list.';
      }
      return missing.length === 0;
    } catch (caught) {
      if (caught instanceof Canceled && request === revision)
        notice.value = 'Download canceled. Tracks downloaded so far are kept.';
      if (request === revision) failed(caught);
      return false;
    } finally {
      download.value = null;
      if (request === revision) busy.value = '';
    }
  }

  watch(active, () => void resume());
  watch([() => range.value?.from, () => range.value?.to], () => void list());
  const filters = computed(() => filterSettings(choice.value, new Date()));
  watch([() => JSON.stringify(filters.value), rows, ready], async () => {
    const currentRows = rows.value;
    if (!ready.value || !currentRows.length) return;
    const current = ++matchRequest;
    // The last answer stays on screen until this one arrives; see `matching`.
    matching.value = true;
    try {
      const result = await engine.match(filters.value, 'strava');
      if (current !== matchRequest || currentRows !== rows.value || !ready.value) return;
      const shown = new Set(currentRows.map((row) => row.id));
      selection.value = { ids: result.ids.filter((id) => shown.has(id)), problem: result.problem };
    } catch (caught) {
      if (current === matchRequest && currentRows === rows.value && ready.value) failed(caught);
    } finally {
      if (current === matchRequest) matching.value = false;
    }
  });
  let matchRequest = 0;

  watch(
    () => choice.value.excluded,
    (after, before) => {
      if (!ready.value || !rows.value.length) return;
      const unchecked = new Set(after);
      const checked = before.filter((id) => !unchecked.has(id));
      if (checked.length) engine.prioritizeStrava(checked);
    },
  );
  watch(
    [choice, rows, adjustments, busy],
    () => {
      if (!session || busy.value || !ready.value || (!rows.value.length && error.value)) return;
      const { excluded: _, ...filters } = choice.value;
      void session.save({
        choice: filters,
        selected: selected(),
        adjustments: adjustments.value,
      });
    },
    { deep: true },
  );

  const foreground = () => {
    if (!session || document.hidden) return;
    if (session.expiresAt <= Date.now()) expired();
    else void resume();
  };
  document.addEventListener('visibilitychange', foreground);
  window.addEventListener('pageshow', foreground);
  window.addEventListener('online', foreground);
  onBeforeUnmount(() => {
    clearTimeout(expiry);
    document.removeEventListener('visibilitychange', foreground);
    window.removeEventListener('pageshow', foreground);
    window.removeEventListener('online', foreground);
    closeEvents();
  });

  return {
    active,
    ready,
    busy,
    choice,
    error,
    notice,
    matched,
    matching,
    rows,
    url,
    until,
    returning,
    status,
    connect,
    close,
    end,
    retry,
    prepare,
    download,
  };
}
