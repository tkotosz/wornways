<script setup lang="ts">
// The widgets that can be added: text, the elevation chart (when an activity recorded
// elevation), and each value this video can show, as tiles with the video's own number,
// grouped by what they measure (time, distance, speed, elevation, the sensors…); a group
// shows only when the video has one of its values.
// Calories a service gives only on request are offered before they are known.
// A value already on the picture is dimmed; each shows once. A new widget comes in the
// middle of the picture (the chart near the bottom).
import { defaultLabel, type Metric, type MetricValue, type Widget } from '@wornways/engine';
import { computed } from 'vue';
import { METRIC_GROUPS, metricName } from '../adjust.ts';

const props = defineProps<{
  widgets: Widget[];
  values: Map<Metric, MetricValue>;
  hasElevation: boolean;
  /** Whether calories can be shown, also before they are fetched. */
  hasCalories: boolean;
  /** Only the values: text and the chart have tools of their own. */
  valuesOnly?: boolean;
  /** Whether a value shows its words as it usually does; else under it, as on the totals card. */
  labels: boolean;
}>();
const emit = defineEmits<{ add: [widget: Widget] }>();

const used = computed(
  () =>
    new Set(props.widgets.flatMap((widget) => (widget.kind === 'metric' ? [widget.metric] : []))),
);
/** The values this video can show, by group; groups with none are left out. */
const groups = computed(() =>
  METRIC_GROUPS.map((group) => ({
    ...group,
    metrics: group.metrics.filter(
      (metric) => props.values.has(metric) || (metric === 'calories' && props.hasCalories),
    ),
  })).filter((group) => group.metrics.length),
);
</script>

<template>
  <div class="add-widget">
    <template v-if="!valuesOnly">
      <h3 class="setting-rows-title">Text and chart</h3>
      <div class="tiles">
        <button
          type="button"
          class="tile"
          @click="emit('add', { kind: 'text', text: 'Your text', x: 50, y: 50, size: 100 })"
        >
          <b aria-hidden="true">Aa</b>
          <span>Text</span>
        </button>
        <button
          v-if="hasElevation"
          type="button"
          class="tile"
          @click="emit('add', { kind: 'elevation-chart', x: 50, y: 88, size: 100 })"
        >
          <svg viewBox="0 0 32 16" aria-hidden="true">
            <path d="M1 15 6 9l4 3 6-8 5 6 4-3 6 8z" />
          </svg>
          <span>Elevation chart</span>
        </button>
      </div>
    </template>
    <section v-for="group in groups" :key="group.name" :aria-label="group.name">
      <h3 class="setting-rows-title">{{ group.name }}</h3>
      <div class="tiles">
        <button
          v-for="metric in group.metrics"
          :key="metric"
          type="button"
          class="tile"
          :disabled="used.has(metric)"
          @click="
            emit('add', {
              kind: 'metric',
              metric,
              label: labels ? defaultLabel(metric) : 'under',
              x: 50,
              y: 50,
              size: 100,
            })
          "
        >
          <b>{{ values.get(metric)?.value ?? 'kcal' }}</b>
          <span>{{ metricName(metric) }}</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}

/* A tile: the value or a sign large, its name small under it. */
.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  min-height: 4.2rem;
  padding: 0.6rem 0.4rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--text);
  background: var(--background);
  font: inherit;
  text-align: center;
}

.tile:hover:not(:disabled) {
  border-color: var(--accent);
}

.tile:disabled {
  opacity: 0.35;
}

.tile b {
  max-width: 100%;
  overflow: hidden;
  font-size: 1rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile span {
  color: var(--muted);
  font-size: 0.72rem;
}

.tile svg {
  width: 2rem;
  height: 1rem;
  fill: rgba(255, 138, 42, 0.45);
  stroke: var(--accent);
  stroke-width: 1.2;
  stroke-linejoin: round;
}
</style>
