<script setup lang="ts">
// One widget's settings: the text of a text widget (the title until another is written),
// its size, how a value shows its words (`labels`: not on the totals card), and removing it
// from the picture. With `only`, just its size or its label, as the strip's chips open them.
import {
  WIDGET_SIZE,
  labelModes,
  valueLines,
  type LabelMode,
  type Metric,
  type MetricValue,
  type Widget,
} from '@wornways/engine';
import { computed } from 'vue';
import { LABEL_MODE_NAMES } from '../adjust.ts';
import ExactNumber from './ExactNumber.vue';

const props = defineProps<{
  widget: Widget;
  title: string;
  values: Map<Metric, MetricValue>;
  labels: boolean;
  only?: 'size' | 'label';
}>();
const emit = defineEmits<{ change: [widget: Widget]; remove: [] }>();

function set(changed: Partial<Widget>): void {
  emit('change', { ...props.widget, ...changed } as Widget);
}

/** The label modes the value can take, each with how the value reads in it. */
const modes = computed(() => {
  const widget = props.widget;
  if (!props.labels || widget.kind !== 'metric' || widget.metric === 'date') return [];
  const value = props.values.get(widget.metric);
  return labelModes(widget.metric).map((mode: LabelMode) => {
    const lines = value ? valueLines(value, mode) : null;
    return {
      mode,
      example: lines ? [lines.line, lines.under].filter(Boolean).join(' / ') : '',
    };
  });
});
const shows = (part: 'size' | 'label') => !props.only || props.only === part;
</script>

<template>
  <div class="widget-settings">
    <div v-if="!only && widget.kind === 'text'" class="field">
      <span class="label" aria-hidden="true">Text</span>
      <input
        type="text"
        aria-label="Text"
        :value="widget.text ?? title"
        placeholder="Text"
        @input="set({ text: ($event.target as HTMLInputElement).value })"
      />
      <button
        v-if="widget.text !== null && title"
        type="button"
        class="link"
        @click="set({ text: null })"
      >
        Use the title, "{{ title }}"
      </button>
    </div>
    <div v-if="shows('label') && widget.kind === 'metric' && modes.length" class="field">
      <span id="widget-label" class="label" :class="{ 'visually-hidden': only }">Label</span>
      <div class="modes" role="radiogroup" aria-labelledby="widget-label">
        <button
          v-for="m in modes"
          :key="m.mode"
          type="button"
          class="mode"
          role="radio"
          :aria-checked="widget.label === m.mode"
          @click="set({ label: m.mode })"
        >
          <span>{{ LABEL_MODE_NAMES[m.mode] }}</span>
          <span class="example">{{ m.example }}</span>
        </button>
      </div>
    </div>
    <div v-if="shows('size')" class="field">
      <span id="widget-size" class="label" :class="{ 'visually-hidden': only }">Size</span>
      <div class="slider" role="group" aria-labelledby="widget-size">
        <input
          type="range"
          :min="WIDGET_SIZE.min"
          :max="WIDGET_SIZE.max"
          step="5"
          :value="widget.size"
          aria-label="Size"
          @change="set({ size: Number(($event.target as HTMLInputElement).value) })"
        />
        <ExactNumber
          label="Exact size (%)"
          :min="WIDGET_SIZE.min"
          :max="WIDGET_SIZE.max"
          :value="widget.size"
          unit="%"
          @change="set({ size: $event })"
        />
      </div>
      <p class="muted hint">Or pinch it on the picture, or drag its corner.</p>
    </div>
    <button v-if="!only" type="button" class="secondary remove" @click="emit('remove')">
      Remove from the picture
    </button>
  </div>
</template>

<style scoped>
.widget-settings {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.label {
  color: var(--muted);
  font-size: 0.85rem;
}

.field input[type='text'] {
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--text);
  background: var(--background);
  font: inherit;
}

.field .link {
  align-self: flex-start;
}

.slider {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.slider input[type='range'] {
  flex: 1;
  min-width: 0;
  accent-color: var(--accent);
}

.hint {
  margin: 0;
  font-size: 0.8rem;
}

.modes {
  display: flex;
  flex-direction: column;
}

/* A label mode: its name, and the value as it reads in it; the chosen one ticked. */
.mode {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 0.1rem;
  border: 0;
  border-bottom: 1px solid var(--line);
  color: var(--text);
  background: none;
  font: inherit;
  text-align: left;
}

.mode .example {
  overflow: hidden;
  color: var(--muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mode[aria-checked='true'] > span:first-child {
  color: var(--accent);
  font-weight: 600;
}

.mode[aria-checked='true'] > span:first-child::after {
  content: ' ✓';
}

.remove {
  border-color: #6b2a24;
  color: #ff7b6b;
}
</style>
