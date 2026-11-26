<script setup lang="ts">
// The widgets on the picture as a list, in the order they are drawn: "+ Add a widget"
// first, then a row per widget with what it shows ("Text · 2 Apr – 8 May 2026 ›"). A row
// opens the widget's settings (`open`); the picked one is marked.
import type { Metric, MetricValue, Widget } from '@wornways/engine';
import { widgetLabel } from '../adjust.ts';

const props = defineProps<{
  widgets: Widget[];
  values: Map<Metric, MetricValue>;
  /** The video's title, which a text widget without its own text shows. */
  title: string;
  selected: number | null;
}>();
const emit = defineEmits<{ add: []; open: [index: number] }>();

/** What a widget shows: its text, its value at the end, or nothing for the chart. */
function shows(widget: Widget): string {
  if (widget.kind === 'text') return widget.text ?? (props.title || 'The title');
  if (widget.kind === 'metric')
    return (
      props.values.get(widget.metric)?.value ?? (widget.metric.includes('calories') ? 'kcal' : '')
    );
  return '';
}
</script>

<template>
  <div class="setting-rows widgets">
    <button type="button" class="add" aria-haspopup="dialog" @click="emit('add')">
      <span aria-hidden="true">+</span> Add a widget
    </button>
    <h3 class="setting-rows-title">On the picture</h3>
    <p v-if="widgets.length === 0" class="muted empty">Nothing yet: add a widget.</p>
    <button
      v-for="(widget, index) in widgets"
      :key="index"
      type="button"
      class="setting-row"
      :class="{ picked: selected === index }"
      :aria-label="`${widgetLabel(widget, values)}${shows(widget) ? `: ${shows(widget)}` : ''}`"
      aria-haspopup="dialog"
      @click="emit('open', index)"
    >
      <span>{{ widgetLabel(widget, values) }}</span>
      <span class="value">{{ shows(widget) }}</span>
    </button>
  </div>
</template>

<style scoped>
.add {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.7rem 0 0.2rem;
  padding: 0.65rem 0.8rem;
  border: 1px dashed #3a4150;
  border-radius: 10px;
  color: var(--accent);
  background: none;
  font: inherit;
  font-weight: 600;
}

.picked > span:first-child {
  color: var(--accent);
  font-weight: 600;
}

.empty {
  margin: 0.6rem 0;
  font-size: 0.9rem;
}
</style>
