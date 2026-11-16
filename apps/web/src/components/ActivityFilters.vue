<script setup lang="ts">
// The filters that choose activities: period, sports, and where they start and end.
import type { TrackEnd } from '@wornways/engine';
import { computed } from 'vue';
import {
  PERIODS,
  periodRange,
  placeSettings,
  sportPicked,
  toggledSports,
  type Choice,
} from '../choice.ts';
import DateField from '../components/DateField.vue';
import NearPlacePanel from '../components/NearPlacePanel.vue';
import type { EngineClient } from '../engine-client.ts';
import { sportText } from '../format.ts';
import type { ActivitySummary } from '../messages.ts';

const props = defineProps<{ engine: EngineClient; library: ActivitySummary[] }>();
const choice = defineModel<Choice>({ required: true });

/** Every sport in the library, the most frequent first. */
const allSports = computed(() => {
  const counts = new Map<string, number>();
  for (const a of props.library) counts.set(a.sport, (counts.get(a.sport) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([sport]) => sport);
});

/**
 * The sports offered as filters: the ones with at least one activity in the period, and
 * the ones picked even if the period has none, so that a picked sport never hides. In the
 * library's order, so that the chips do not move around when the period changes.
 */
const sports = computed(() => {
  const range = periodRange(choice.value, new Date());
  if (!range) return allSports.value;
  const inPeriod = new Set(
    props.library
      .filter(
        (a) =>
          (range.from === null || a.startTime >= range.from) &&
          (range.to === null || a.startTime < range.to),
      )
      .map((a) => a.sport),
  );
  return allSports.value.filter((sport) => inPeriod.has(sport) || sportPicked(choice.value, sport));
});

function update(change: Partial<Choice>): void {
  choice.value = { ...choice.value, ...change };
}

function toggleSport(sport: string): void {
  update({ sports: toggledSports(choice.value, sport) });
}

const key = (end: TrackEnd) => (end === 'start' ? 'startNear' : 'endNear');

/**
 * Turns a place filter on or off. Turned on without a place, it starts at the other
 * filter's place, so activities that start and end at the same place take one pick.
 */
function toggleNear(end: TrackEnd, on: boolean): void {
  const near = choice.value[key(end)];
  const other = choice.value[key(end === 'start' ? 'end' : 'start')];
  const place = on && !near.place && other.on ? other.place : near.place;
  update({ [key(end)]: { ...near, on, place } });
}

/** The period and sports alone, which choose the activities places are suggested from. */
const suggestFrom = computed(() => placeSettings(choice.value, new Date()));
</script>

<template>
  <div class="filters">
    <div class="filter">
      <span class="label">Period</span>
      <div class="chips">
        <button
          v-for="p in PERIODS"
          :key="p.id"
          type="button"
          class="chip"
          :aria-pressed="choice.period === p.id"
          @click="update({ period: p.id })"
        >
          {{ p.label }}
        </button>
      </div>
      <div v-if="choice.period === 'custom'" class="dates">
        <DateField
          label="From"
          :model-value="choice.customFrom"
          @update:model-value="update({ customFrom: $event })"
        />
        <DateField
          label="To"
          :model-value="choice.customTo"
          @update:model-value="update({ customTo: $event })"
        />
      </div>
    </div>

    <div class="filter">
      <span class="label">Sports</span>
      <div class="chips">
        <button
          type="button"
          class="chip"
          :aria-pressed="choice.sports === null"
          @click="update({ sports: null })"
        >
          All
        </button>
        <button
          v-for="s in sports"
          :key="s"
          type="button"
          class="chip"
          :aria-pressed="sportPicked(choice, s)"
          @click="toggleSport(s)"
        >
          {{ sportText(s) }}
        </button>
      </div>
    </div>

    <div class="filter">
      <span class="label">Places</span>
      <div class="places">
        <template v-for="end in ['start', 'end'] as const" :key="end">
          <label class="check">
            <input
              type="checkbox"
              :checked="choice[key(end)].on"
              @change="toggleNear(end, ($event.target as HTMLInputElement).checked)"
            />
            {{ end === 'start' ? 'Starts near a place' : 'Ends near a place' }}
          </label>
          <NearPlacePanel
            v-if="choice[key(end)].on"
            :model-value="choice[key(end)]"
            :engine="engine"
            :end="end"
            :suggest-from="suggestFrom"
            @update:model-value="update({ [key(end)]: $event })"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 1.5rem 0;
}

.filter {
  display: grid;
  grid-template-columns: 5.5rem 1fr;
  gap: 0.6rem;
  align-items: start;
}

.label {
  padding-top: 0.4rem;
  color: var(--muted);
  font-size: 0.85rem;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.dates {
  grid-column: 2;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.places {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.check {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.6rem;
}

@media (max-width: 600px) {
  .filter {
    grid-template-columns: 1fr;
  }

  .dates {
    grid-column: 1;
  }
}
</style>
