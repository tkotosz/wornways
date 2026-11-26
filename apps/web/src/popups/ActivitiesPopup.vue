<script setup lang="ts">
// Choosing the activities the video shows, with filters and by ticking them. The list and the
// other filters come once a period is picked. Nothing is deleted here. The button at the
// bottom takes the activities ticked to the editor.
import { computed } from 'vue';
import { placeMissing, type Choice } from '../choice.ts';
import ActivityFilters from '../components/ActivityFilters.vue';
import ActivityGrid from '../components/ActivityGrid.vue';
import AppPopup from '../components/AppPopup.vue';
import DemoGuide from '../components/DemoGuide.vue';
import LoadingStatus from '../components/LoadingStatus.vue';
import type { EngineClient } from '../engine-client.ts';
import { countText } from '../format.ts';
import type { ActivitySummary, MatchReport, Source } from '../messages.ts';

const props = defineProps<{
  engine: EngineClient;
  closable: boolean;
  library: ActivitySummary[];
  /** Which activities the filters match. */
  matched: MatchReport;
  distanceScale: { min: number; max: number } | null;
  strava?: boolean;
  /** Where the activities come from, told above the filters. */
  source: Source;
  busy?: string;
  /** The filters changed and the list shown is still the one from before. */
  matching?: boolean;
  notice?: string;
  canRetry?: boolean;
  /** What the source keeps on this device, to manage from here: "Manage files". */
  manage: string | null;
}>();
const choice = defineModel<Choice>({ required: true });
const emit = defineEmits<{
  close: [];
  menu: [];
  switch: [];
  store: [];
  next: [];
  retry: [];
}>();

const SOURCE_LABELS: Record<Source, string> = {
  files: 'Files on this device',
  strava: 'Strava',
  rwgps: 'Ride with GPS',
  demo: 'Demo: made-up activities in Mallorca',
};

const byId = computed(() => new Map(props.library.map((a) => [a.id, a])));
const rows = computed(() => props.matched.ids.flatMap((id) => byId.value.get(id) ?? []));
const ticked = computed(() => rows.value.filter((a) => !choice.value.excluded.includes(a.id)));
const usable = computed(
  () =>
    choice.value.period !== null &&
    !props.busy &&
    !props.matching &&
    ticked.value.length > 0 &&
    !placeMissing(choice.value),
);
</script>

<template>
  <AppPopup
    title="Choose your activities"
    :closable="closable"
    @close="emit('close')"
    @menu="emit('menu')"
  >
    <p class="muted source" data-testid="source">
      Current source: {{ SOURCE_LABELS[source] }}
      <button v-if="manage" type="button" class="link" @click="emit('store')">
        {{ manage }}
      </button>
      <button type="button" class="link" @click="emit('switch')">Change source</button>
    </p>
    <DemoGuide v-if="source === 'demo'" />
    <ActivityFilters
      v-model="choice"
      :engine="engine"
      :library="library"
      :strava="strava"
      :distance-scale="distanceScale"
    />

    <LoadingStatus v-if="busy" :text="busy" />
    <p v-if="notice" class="muted" role="status">{{ notice }}</p>

    <p v-if="placeMissing(choice)" class="error">
      Set the place, or turn off its filter, to go on.
    </p>
    <p v-else-if="matched.problem" class="error" role="alert">
      {{ matched.problem }}
      <button v-if="canRetry && !busy" type="button" class="link" @click="emit('retry')">
        Try again
      </button>
    </p>

    <ActivityGrid
      v-if="rows.length && choice.period !== null"
      :excluded="choice.excluded"
      :rows="rows"
      :strava="strava"
      :rwgps="source === 'rwgps'"
      mode="select"
      test-id="chosen"
      @update:excluded="choice = { ...choice, excluded: $event }"
    />

    <template #footer>
      <button type="button" class="primary" :disabled="!usable" @click="emit('next')">
        {{
          usable && choice.period !== null
            ? `Use ${countText(ticked.length, 'activity', 'activities')}`
            : 'Use these activities'
        }}
      </button>
    </template>
  </AppPopup>
</template>

<style scoped>
.source {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin: 0 0 0.5rem;
}
</style>
