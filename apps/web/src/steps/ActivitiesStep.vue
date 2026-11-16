<script setup lang="ts">
// Step 2: choose the activities the video shows, with filters and by ticking them. Nothing
// is deleted here.
import { computed } from 'vue';
import { placeMissing, type Choice } from '../choice.ts';
import ActivityFilters from '../components/ActivityFilters.vue';
import ActivityGrid from '../components/ActivityGrid.vue';
import type { EngineClient } from '../engine-client.ts';
import type { ActivitySummary, MatchReport } from '../messages.ts';

const props = defineProps<{
  engine: EngineClient;
  library: ActivitySummary[];
  /** Which activities the filters match. */
  matched: MatchReport;
}>();
const choice = defineModel<Choice>({ required: true });
const emit = defineEmits<{ back: []; next: [] }>();

const byId = computed(() => new Map(props.library.map((a) => [a.id, a])));
const rows = computed(() => props.matched.ids.flatMap((id) => byId.value.get(id) ?? []));
const ticked = computed(() => rows.value.filter((a) => !choice.value.excluded.includes(a.id)));
</script>

<template>
  <section>
    <h1>Choose your activities</h1>

    <ActivityFilters v-model="choice" :engine="engine" :library="library" />

    <p v-if="placeMissing(choice)" class="error">
      Set the place, or turn off its filter, to go on.
    </p>
    <p v-else-if="matched.problem" class="error" role="alert">{{ matched.problem }}</p>

    <ActivityGrid
      v-if="rows.length"
      :excluded="choice.excluded"
      :rows="rows"
      mode="select"
      test-id="chosen"
      @update:excluded="choice = { ...choice, excluded: $event }"
    />

    <div class="footer">
      <button type="button" class="secondary" @click="emit('back')">← Back</button>
      <button
        type="button"
        class="primary"
        :disabled="ticked.length === 0 || placeMissing(choice)"
        @click="emit('next')"
      >
        Continue →
      </button>
    </div>
  </section>
</template>
