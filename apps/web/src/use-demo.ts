import { ref } from 'vue';
import type { Adjustments } from './adjust.ts';
import { ALL_ACTIVITIES, type Choice } from './choice.ts';
import type { EngineClient } from './engine-client.ts';
import type { ActivitySummary } from './messages.ts';
import { useMatches } from './use-matches.ts';

/**
 * The demo source: made-up activities to try Wornways with, held in the worker's memory
 * while it is open. Its choice (all of its activities at first) and adjustments start fresh
 * each time and are never saved, and it never touches the person's own library.
 */
export function useDemo(engine: EngineClient) {
  const active = ref(false);
  const busy = ref('');
  const error = ref('');
  const rows = ref<ActivitySummary[]>([]);
  const choice = ref<Choice>({ ...ALL_ACTIVITIES });
  const adjustments = ref<Adjustments>({});
  const { matches, matching } = useMatches(engine, 'demo', choice, rows);

  /** Opens the demo; false when its activities could not be loaded. */
  async function open(): Promise<boolean> {
    busy.value = 'Loading the demo…';
    error.value = '';
    try {
      rows.value = await engine.startDemo();
      choice.value = { ...ALL_ACTIVITIES };
      adjustments.value = {};
      active.value = true;
      return true;
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught);
      return false;
    } finally {
      busy.value = '';
    }
  }

  /** Closes the demo and lets its activities go. */
  async function close(): Promise<void> {
    if (!active.value) return;
    active.value = false;
    rows.value = [];
    await engine.endDemo().catch(() => {});
  }

  return { active, busy, error, rows, choice, adjustments, matches, matching, open, close };
}
