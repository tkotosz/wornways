import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { NO_CHOICE, periodRange, type Choice } from './choice.ts';
import { Canceled, StravaExpired, type EngineClient } from './engine-client.ts';
import type { ActivitySummary, MatchReport } from './messages.ts';
import {
  finishStravaAuthorization,
  stravaAuthorization,
  stravaClientId,
  takeStravaCallback,
} from './strava-auth.ts';

export function useStrava(engine: EngineClient, onEnd: () => void) {
  const active = ref(false);
  const choice = ref<Choice>({ ...NO_CHOICE, period: 'this-month' });
  const rows = ref<ActivitySummary[]>([]);
  const url = ref<URL | null>(null);
  const error = ref('');
  const busy = ref('');
  const notice = ref('');
  let callback = takeStravaCallback();
  const hasCallback = callback !== null;
  const range = computed(() => periodRange(choice.value, new Date()));
  let revision = 0;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let socket: WebSocket | null = null;

  const matched = computed<MatchReport>(() => ({
    ids: rows.value
      .filter((row) => !choice.value.sports || choice.value.sports.includes(row.sport))
      .map((row) => row.id),
    problem: error.value || null,
  }));

  function failed(caught: unknown) {
    if (caught instanceof Canceled) return;
    if (caught instanceof StravaExpired) void end();
    error.value = caught instanceof Error ? caught.message : String(caught);
  }

  async function end(disconnect = false) {
    if (!active.value) return;
    const ended = ++revision;
    clearTimeout(expiry);
    closeEvents();
    active.value = false;
    rows.value = [];
    choice.value = { ...NO_CHOICE, period: 'this-month' };
    error.value = '';
    busy.value = '';
    notice.value = '';
    onEnd();
    try {
      await engine.endStrava(disconnect);
      if (disconnect && revision === ended)
        notice.value = 'Strava disconnected and temporary activities cleared.';
    } catch (caught) {
      if (revision === ended) failed(caught);
    }
  }

  async function connect() {
    if (!callback) return false;
    const params = callback;
    callback = null;
    busy.value = 'Connecting to Strava…';
    try {
      const { token, expiresAt, ticket } = await finishStravaAuthorization(params);
      const events = await openEvents(ticket);
      await engine.startStrava({ token, expiresAt });
      if (events.readyState !== WebSocket.OPEN) {
        await engine.endStrava();
        throw new Error('Could not keep the Strava connection open. Connect again.');
      }
      active.value = true;
      expiry = setTimeout(
        () => failed(new StravaExpired('Your Strava session expired. Connect again.')),
        expiresAt - Date.now(),
      );
      return true;
    } catch (caught) {
      closeEvents();
      busy.value = '';
      failed(caught);
      return false;
    }
  }

  function closeEvents() {
    const events = socket;
    socket = null;
    events?.close();
  }

  async function openEvents(ticket: string): Promise<WebSocket> {
    const endpoint = new URL('/api/strava/events', location.origin);
    endpoint.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const events = new WebSocket(endpoint, 'session.' + ticket);
    socket = events;
    events.addEventListener('message', ({ data }) => {
      if (socket !== events) return;
      if (!active.value) closeEvents();
      if (data === 'revoked')
        failed(new StravaExpired('Strava access was revoked. Temporary activities were cleared.'));
      if (data === 'activity')
        failed(
          new StravaExpired(
            'An activity changed or was deleted on Strava. Connect again to use the updated list.',
          ),
        );
    });
    events.addEventListener('close', () => {
      if (socket === events && active.value)
        failed(new StravaExpired('The Strava connection closed. Connect again.'));
    });
    await new Promise<void>((resolve, reject) => {
      const unavailable = () => reject(new Error('Could not connect to Strava. Try again.'));
      const timer = setTimeout(unavailable, 8000);
      events.addEventListener(
        'open',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      events.addEventListener(
        'error',
        () => {
          clearTimeout(timer);
          unavailable();
        },
        { once: true },
      );
      events.addEventListener(
        'close',
        () => {
          clearTimeout(timer);
          unavailable();
        },
        { once: true },
      );
    });
    return events;
  }

  async function configure() {
    const id = await stravaClientId();
    if (id) url.value = stravaAuthorization(id);
  }

  async function list() {
    if (!active.value) return;
    const request = ++revision;
    const from = range.value?.from;
    const to = range.value?.to;
    rows.value = [];
    notice.value = '';
    busy.value = '';
    error.value = '';
    choice.value = { ...choice.value, excluded: [] };

    if (from == null || to == null) {
      error.value = 'Choose a start and end date for your Strava activities.';
      await engine.listStrava(null, null).catch(() => {});
      return;
    }

    busy.value = 'Finding activities on Strava…';
    try {
      const activities = await engine.listStrava(from, to);
      if (request !== revision) return;
      choice.value = { ...choice.value, excluded: activities.map((row) => row.id) };
      rows.value = activities;
      if (!activities.length) notice.value = 'No Strava activities in this period.';
    } catch (caught) {
      if (request === revision) failed(caught);
    } finally {
      if (request === revision) busy.value = '';
    }
  }

  async function prepare(ids: string[]) {
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

  watch([active, () => range.value?.from, () => range.value?.to], list);
  watch(
    () => choice.value.excluded,
    (after, before) => {
      if (!active.value || !rows.value.length) return;
      const unchecked = new Set(after);
      const checked = before.filter((id) => !unchecked.has(id));
      if (checked.length) engine.prioritizeStrava(checked);
    },
  );
  const leavePage = () => void end();
  window.addEventListener('pagehide', leavePage);
  onBeforeUnmount(() => {
    window.removeEventListener('pagehide', leavePage);
    leavePage();
  });

  return {
    active,
    busy,
    hasCallback,
    choice,
    error,
    notice,
    matched,
    rows,
    url,
    connect,
    configure,
    end,
    list,
    prepare,
  };
}
