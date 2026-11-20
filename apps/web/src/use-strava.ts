import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { Adjustments } from './adjust.ts';
import { NO_CHOICE, filterSettings, periodRange, type Choice } from './choice.ts';
import { Canceled, StravaExpired, type EngineClient } from './engine-client.ts';
import type { ActivitySummary, MatchReport } from './messages.ts';
import {
  finishStravaAuthorization,
  stravaAuthorization,
  stravaConfiguration,
  takeStravaCallback,
  type StravaLogin,
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
  let callback = takeStravaCallback();
  let session: (Pick<StravaLogin, 'ticket' | 'expiresAt'> & StravaDraftStore) | null = null;
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

  async function end(disconnect = false): Promise<boolean> {
    if (!session) return false;
    const ended = ++revision;
    session.end();
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
        return false;
      }
      const storage = await openStravaDraft(login, params !== null);
      if (!storage) return false;
      // Access tokens stay in the worker after the authorization response.
      const { token, expiresAt, sessionId, ticket, cacheKey } = login;
      await engine.startStrava({ token, expiresAt, sessionId, cacheKey });
      const { draft, ...draftStore } = storage;
      session = { expiresAt, ticket, ...draftStore };
      choice.value = { ...initialChoice(), ...draft?.choice };
      adjustments.value = draft?.adjustments ?? { ...defaultAdjustments };
      initialSelection = draft?.selected ?? [];
      active.value = true;
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

  async function openEvents(ticket: string): Promise<void> {
    const endpoint = new URL('/api/strava/events', location.origin);
    endpoint.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const events = new WebSocket(endpoint, 'session.' + ticket);
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
        reject(new Error('Could not reach Strava. Try again when online.'));
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
      throw new Error('Could not reach Strava. Try again when online.');
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
      await openEvents(attempt.ticket);
      if (session !== attempt) return;
      ready.value = true;
      const keep = rows.value.length ? selected() : initialSelection;
      initialSelection = [];
      await list(keep);
    } catch (caught) {
      if (session !== attempt) return;
      closeEvents();
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

  async function prepare(ids: string[]) {
    if (!ready.value) return false;
    const request = revision;
    busy.value = 'Loading selected tracks…';
    error.value = '';
    try {
      const missing = await engine.prepareStrava(ids);
      if (request !== revision) return false;
      if (missing.length) {
        const unavailable = new Set(missing);
        rows.value = rows.value.filter((row) => !unavailable.has(row.id));
        notice.value =
          'Some selected activities had no usable GPS track and were removed from the list.';
      }
      return missing.length === 0;
    } catch (caught) {
      if (request === revision) failed(caught);
      return false;
    } finally {
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
    try {
      const result = await engine.match(filters.value, 'strava');
      if (current !== matchRequest || currentRows !== rows.value || !ready.value) return;
      const shown = new Set(currentRows.map((row) => row.id));
      selection.value = { ids: result.ids.filter((id) => shown.has(id)), problem: result.problem };
    } catch (caught) {
      if (current === matchRequest && currentRows === rows.value && ready.value) failed(caught);
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
    rows,
    url,
    connect,
    end,
    retry,
    prepare,
  };
}
