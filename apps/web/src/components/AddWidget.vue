<script setup lang="ts">
// The widgets that can be added: text, the charts (`charts`: the ones these activities can
// show, each with its icon in its color), and each value this video can show, as tiles with
// the video's own number, grouped by what they measure (time, distance, speed, elevation, the
// sensors…); a group shows only when the video has one of its values. With `only`, just the
// values or just the charts, as the strip's chips open them.
// Calories a service gives only on request are offered before they are known.
// A value or a chart already on the picture is dimmed; each shows once. A new widget comes in
// the middle of the picture (a chart along the bottom).
import {
  chartColors,
  defaultLabel,
  type ChartKind,
  type Metric,
  type MetricValue,
  type Widget,
} from '@wornways/engine';
import { computed } from 'vue';
import { CHARTS, METRIC_GROUPS, metricName } from '../adjust.ts';
import StatIcon from './StatIcon.vue';

const props = defineProps<{
  widgets: Widget[];
  values: Map<Metric, MetricValue>;
  /** The charts these activities can show; none on the totals card. */
  charts: ChartKind[];
  /** Whether calories can be shown, also before they are fetched. */
  hasCalories: boolean;
  /** Only the values, or only the charts. */
  only?: 'values' | 'charts';
}>();
const emit = defineEmits<{ add: [widget: Widget] }>();

const used = computed(
  () =>
    new Set(props.widgets.flatMap((widget) => (widget.kind === 'metric' ? [widget.metric] : []))),
);
const usedCharts = computed(
  () => new Set(props.widgets.flatMap((widget) => (widget.kind === 'chart' ? [widget.chart] : []))),
);
/** The values this video can show, by group; groups with none are left out. */
const groups = computed(() =>
  METRIC_GROUPS.map((group) => ({
    ...group,
    metrics: group.metrics.filter(
      (metric) => props.values.has(metric) || (metric.includes('calories') && props.hasCalories),
    ),
  })).filter((group) => group.metrics.length),
);
</script>

<template>
  <div class="add-widget">
    <template v-if="!only">
      <h3 class="setting-rows-title">Text</h3>
      <div class="tiles">
        <button
          type="button"
          class="tile"
          @click="emit('add', { kind: 'text', text: 'Your text', x: 50, y: 50, size: 100 })"
        >
          <b aria-hidden="true">Aa</b>
          <span>Text</span>
        </button>
      </div>
    </template>
    <section v-if="only !== 'values' && charts.length" aria-label="Charts">
      <h3 v-if="!only" class="setting-rows-title">Charts</h3>
      <div class="tiles">
        <button
          v-for="chart in charts"
          :key="chart"
          type="button"
          class="tile"
          :disabled="usedCharts.has(chart)"
          @click="emit('add', { kind: 'chart', chart, x: 50, y: 88, size: 100 })"
        >
          <b :style="{ color: `rgb(${chartColors(chart).line})` }">
            <StatIcon :icon="CHARTS[chart].icon" />
          </b>
          <span>{{ CHARTS[chart].name }}</span>
        </button>
      </div>
    </section>
    <section
      v-for="group in only === 'charts' ? [] : groups"
      :key="group.name"
      :aria-label="group.name"
    >
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
              label: defaultLabel(metric),
              x: 50,
              y: 50,
              size: 100,
            })
          "
        >
          <b>{{ values.get(metric)?.value ?? 'kcal' }}</b>
          <span>{{ metricName(metric, values) }}</span>
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

.tile b .stat-icon {
  width: 1.5rem;
  height: 1.5rem;
  margin: 0;
}
</style>
