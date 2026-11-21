import { computed, ref, watch, type Ref } from 'vue';
import { filterSettings, type Choice } from './choice.ts';
import type { EngineClient } from './engine-client.ts';
import type { ActivitySummary, MatchReport, Source } from './messages.ts';

/**
 * Which of a source's activities the filters match, asked again whenever the filters or the
 * activities change; ticking activities is not a filter, so it asks nothing. The last answer
 * stays until the next one arrives, so the list does not empty and jump back to the top;
 * `matching` tells that it may be out of date, so nobody goes on with it meanwhile. A newer
 * answer may arrive before an older one, so only the latest request's answer is kept.
 */
export function useMatches(
  engine: EngineClient,
  source: Source,
  choice: Ref<Choice>,
  rows: Ref<ActivitySummary[]>,
) {
  const matches = ref<MatchReport>({ ids: [], problem: null });
  const matching = ref(false);
  const filters = computed(() => filterSettings(choice.value, new Date()));
  let latest = 0;
  watch([() => JSON.stringify(filters.value), rows], async () => {
    const request = ++latest;
    if (rows.value.length === 0) {
      matches.value = { ids: [], problem: null };
      matching.value = false;
      return;
    }
    matching.value = true;
    try {
      const result = await engine.match(filters.value, source);
      if (request === latest) matches.value = result;
    } catch (error) {
      if (request === latest)
        matches.value = {
          ids: [],
          problem: error instanceof Error ? error.message : String(error),
        };
    } finally {
      if (request === latest) matching.value = false;
    }
  });
  return { matches, matching };
}
