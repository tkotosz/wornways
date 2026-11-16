<script setup lang="ts">
// Activities as a grid with a header row. In "select" mode every row has a checkbox, all
// ticked at first, with a select-all box in the header: the ticked ones are what the video
// shows. In "delete" mode every row has a button that deletes the activity.
import { computed, ref, watch } from 'vue';
import { countText, dayText, kmText, shortDayText, sportText } from '../format.ts';
import type { ActivitySummary } from '../messages.ts';

const props = defineProps<{
  /** The activities shown, newest first. */
  rows: ActivitySummary[];
  mode: 'select' | 'delete';
  /** Names the grid for tests: the table gets it, its count line `<testId>-count`. */
  testId: string;
}>();
/** In "select" mode: the ids of the unticked activities, kept when other rows come and go. */
const excluded = defineModel<string[]>('excluded', { default: () => [] });
const emit = defineEmits<{ delete: [id: string] }>();

const selecting = computed(() => props.mode === 'select');
const ticked = computed(() => props.rows.filter((a) => !excluded.value.includes(a.id)));
const tickedKm = computed(() => ticked.value.reduce((sum, a) => sum + a.distanceM, 0));
const allTicked = computed(
  () => props.rows.length > 0 && ticked.value.length === props.rows.length,
);
const someTicked = computed(() => ticked.value.length > 0 && !allTicked.value);

/** The header checkbox: shows "some" as its in-between state. */
const headerBox = ref<HTMLInputElement | null>(null);
watch([someTicked, headerBox], () => {
  if (headerBox.value) headerBox.value.indeterminate = someTicked.value;
});

function toggle(id: string): void {
  if (!selecting.value) return;
  excluded.value = excluded.value.includes(id)
    ? excluded.value.filter((e) => e !== id)
    : [...excluded.value, id];
}

/** Ticks every row shown, or unticks them all when all are ticked. */
function toggleAll(): void {
  const shown = new Set(props.rows.map((a) => a.id));
  const others = excluded.value.filter((id) => !shown.has(id));
  excluded.value = allTicked.value ? [...others, ...shown] : others;
}
</script>

<template>
  <strong v-if="selecting" class="count" :data-testid="`${testId}-count`">
    {{ ticked.length }} of {{ countText(rows.length, 'activity', 'activities') }} selected ·
    {{ kmText(tickedKm) }}
  </strong>

  <div class="scroller">
    <table :data-testid="testId" :class="{ selecting }">
      <thead>
        <tr>
          <th v-if="selecting" class="box">
            <input
              ref="headerBox"
              type="checkbox"
              aria-label="Select all shown"
              :checked="allTicked"
              @change="toggleAll"
            />
          </th>
          <th class="date">Date</th>
          <th>Name</th>
          <th class="sport">Sport</th>
          <th class="km">Distance</th>
          <th v-if="!selecting" class="remove"><span class="hidden">Delete</span></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="a in rows"
          :key="a.id"
          :class="{ off: selecting && excluded.includes(a.id) }"
          @click="toggle(a.id)"
        >
          <td v-if="selecting" class="box">
            <input
              type="checkbox"
              :aria-label="a.name"
              :checked="!excluded.includes(a.id)"
              @click.stop
              @change="toggle(a.id)"
            />
          </td>
          <td class="date">
            <span class="long">{{ dayText(a.startTime) }}</span>
            <span class="short">{{ shortDayText(a.startTime) }}</span>
          </td>
          <td class="name">{{ a.name }}</td>
          <td class="sport muted">{{ sportText(a.sport) }}</td>
          <td class="km muted">{{ kmText(a.distanceM) }}</td>
          <td v-if="!selecting" class="remove">
            <button
              type="button"
              class="link"
              :aria-label="`Delete ${a.name}`"
              title="Delete"
              @click="emit('delete', a.id)"
            >
              ✕
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.scroller {
  max-height: 28rem;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 12px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 0.6rem 0.6rem;
  color: var(--muted);
  background: #121722;
  font-size: 0.8rem;
  font-weight: 600;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

td {
  padding: 0.45rem 0.6rem;
  border-top: 1px solid var(--line);
}

.count {
  display: block;
  margin-bottom: 0.6rem;
}

.selecting tbody tr {
  cursor: pointer;
}

.remove {
  width: 2.5rem;
  text-align: center;
}

.remove .link {
  text-decoration: none;
}

.hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

tbody tr:hover {
  background: rgba(255, 255, 255, 0.03);
}

tr.off td:not(.box) {
  opacity: 0.45;
}

.box {
  width: 2.2rem;
}

.date {
  width: 9.5rem;
  white-space: nowrap;
}

.name {
  max-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sport {
  width: 9rem;
}

.short {
  display: none;
}

.km {
  width: 6rem;
  text-align: right;
  white-space: nowrap;
}

@media (max-width: 600px) {
  .sport {
    display: none;
  }

  .date {
    width: 5rem;
  }

  .long {
    display: none;
  }

  .short {
    display: inline;
  }

  .km {
    width: 4.5rem;
  }
}
</style>
