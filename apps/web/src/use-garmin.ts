import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { filterSettings, NO_CHOICE, periodRange, type Choice } from './choice.ts';
import { Canceled, GarminExpired, type EngineClient } from './engine-client.ts';
import type { ActivitySummary, MatchReport } from './messages.ts';

const initialChoice = (): Choice => ({ ...NO_CHOICE, period: 'this-month' });

/** A Garmin replay lives in this tab until it ends or is reloaded. */
export function useGarmin(engine: EngineClient, onEnd: () => void) {
  const available = ref(false);
  const active = ref(false);
  const busy = ref('');
  const error = ref('');
  const notice = ref('');
  const rows = ref<ActivitySummary[]>([]);
  const choice = ref<Choice>(initialChoice());
  const selection = ref<MatchReport>({ ids: [], problem: null });
  const matched = computed(() => ({
    ids: selection.value.ids,
    problem: error.value || selection.value.problem,
  }));
  const range = computed(() => periodRange(choice.value, new Date()));
  const filters = computed(() => filterSettings(choice.value, new Date()));
  let expiresAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let revision = 0;
  let matchRequest = 0;

  async function discover(): Promise<void> {
    try {
      const response = await fetch('/api/garmin', {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) available.value = (await response.json()).available === true;
    } catch {
      // A static or offline deployment may only offer files.
    }
  }

  async function end(): Promise<boolean> {
    if (!active.value) return false;
    const ended = ++revision;
    clearTimeout(timer);
    expiresAt = 0;
    active.value = false;
    busy.value = '';
    error.value = '';
    notice.value = '';
    rows.value = [];
    choice.value = initialChoice();
    selection.value = { ids: [], problem: null };
    onEnd();
    try {
      await engine.endGarmin();
      return revision === ended;
    } catch (caught) {
      if (revision === ended) failed(caught);
      return false;
    }
  }

  function failed(caught: unknown): void {
    if (caught instanceof Canceled) return;
    if (caught instanceof GarminExpired) void end();
    error.value = caught instanceof Error ? caught.message : String(caught);
  }

  function expire(): void {
    failed(new GarminExpired('Your Garmin Connect session ended. Connect again to continue.'));
  }

  async function connect(key: string): Promise<boolean> {
    if (!available.value || active.value || busy.value) return false;
    const request = ++revision;
    busy.value = 'Connecting to Garmin Connect…';
    error.value = '';
    try {
      expiresAt = await engine.startGarmin(key);
      if (request !== revision) return false;
      active.value = true;
      timer = setTimeout(expire, expiresAt - Date.now());
      void list();
      return true;
    } catch (caught) {
      if (request === revision) failed(caught);
      return false;
    } finally {
      if (request === revision) busy.value = '';
    }
  }

  async function list(keep: string[] = []): Promise<void> {
    if (!active.value) return;
    const request = ++revision;
    const from = range.value?.from ?? null;
    const to = range.value?.to ?? null;
    rows.value = [];
    selection.value = { ids: [], problem: null };
    busy.value = 'Finding activities on Garmin Connect…';
    error.value = '';
    notice.value = '';
    try {
      const activities = await engine.listGarmin(from, to);
      if (request !== revision) return;
      if (from === null || to === null) {
        error.value = 'Choose a start and end date for your Garmin Connect activities.';
        return;
      }
      const remembered = new Set(keep);
      choice.value = {
        ...choice.value,
        excluded: activities.filter((row) => !remembered.has(row.id)).map((row) => row.id),
      };
      rows.value = activities;
      if (!activities.length) notice.value = 'No Garmin Connect activities in this period.';
    } catch (caught) {
      if (request === revision) failed(caught);
    } finally {
      if (request === revision) busy.value = '';
    }
  }

  function retry(): void {
    const unchecked = new Set(choice.value.excluded);
    void list(rows.value.filter((row) => !unchecked.has(row.id)).map((row) => row.id));
  }

  async function prepare(ids: string[]): Promise<boolean> {
    if (!active.value || busy.value) return false;
    const request = revision;
    busy.value = 'Loading selected Garmin Connect tracks…';
    error.value = '';
    notice.value = '';
    try {
      const missing = new Set(await engine.prepareGarmin(ids));
      if (request !== revision) return false;
      if (!missing.size) return true;
      rows.value = rows.value.filter((row) => !missing.has(row.id));
      notice.value =
        'Some selected activities had no usable GPS track and were removed from the list.';
    } catch (caught) {
      if (request === revision) failed(caught);
    } finally {
      if (request === revision) busy.value = '';
    }
    return false;
  }

  watch([() => range.value?.from, () => range.value?.to], () => void list());
  watch([() => JSON.stringify(filters.value), rows], async () => {
    const currentRows = rows.value;
    if (!currentRows.length) {
      selection.value = { ids: [], problem: null };
      return;
    }
    const request = ++matchRequest;
    try {
      const result = await engine.match(filters.value, 'garmin');
      if (request === matchRequest && currentRows === rows.value) selection.value = result;
    } catch (caught) {
      if (request === matchRequest && currentRows === rows.value) failed(caught);
    }
  });

  const foreground = () => {
    if (active.value && Date.now() >= expiresAt) expire();
  };
  document.addEventListener('visibilitychange', foreground);
  window.addEventListener('pageshow', foreground);
  onBeforeUnmount(() => {
    ++revision;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', foreground);
    window.removeEventListener('pageshow', foreground);
    if (active.value || busy.value) void engine.endGarmin().catch(() => {});
  });

  return {
    available,
    active,
    busy,
    error,
    notice,
    rows,
    choice,
    matched,
    discover,
    connect,
    end,
    retry,
    prepare,
  };
}
