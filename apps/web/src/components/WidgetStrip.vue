<script setup lang="ts">
// The chips for arranging widgets, in the strip under the picture (Overlay, and Ending with
// the totals card). With no widget picked: adding a text or a metric, and the elevation chart
// on or off. With one picked, the strip is that widget's: Done lets it go; Edit writes a
// text's text; Size, Label (where a value's words are, and what they say) and Format (a time,
// date or clock time) open their sheet; Remove takes it off the picture. The section's own settings
// stay in the slot, after the tools.
import type { Widget } from '@wornways/engine';
import { computed } from 'vue';
import { FORMAT_NAMES, LABEL_MODE_NAMES, formatOf } from '../adjust.ts';

const props = defineProps<{
  widgets: Widget[];
  selected: number | null;
  /** The totals card's widgets: values are its totals, with no label modes and no chart. */
  card: boolean;
  /** The elevation chart: whether it is offered (an activity recorded elevation) and shown. */
  chart: { offered: boolean; shown: boolean };
}>();
const emit = defineEmits<{
  /** Lets the picked widget go. */
  done: [];
  /** Adds a text, opens the values, or turns the chart on or off. */
  tool: [tool: 'text' | 'values' | 'chart'];
  /** Writes the picked text widget's text. */
  edit: [index: number];
  /** Opens the picked widget's size, label or format in a sheet. */
  open: [index: number, what: 'size' | 'label' | 'format'];
  remove: [index: number];
}>();

const picked = computed(() =>
  props.selected === null ? null : (props.widgets[props.selected] ?? null),
);
/**
 * The picked value's label chip: where its words are, or on the totals card, where they are
 * always under it, that its words can be edited.
 */
const labelChip = computed(() => {
  if (picked.value?.kind !== 'metric') return '';
  return props.card ? 'Edit' : LABEL_MODE_NAMES[picked.value.label];
});
/** The picked value's format, when it is a time, a date or a clock time. */
const format = computed(() => (picked.value ? formatOf(picked.value, props.card) : null));
</script>

<template>
  <div v-if="picked && selected !== null" class="setting-rows widget-chips">
    <button type="button" class="setting-row done" @click="emit('done')">
      <span class="value">✓ Done</span>
    </button>
    <button
      v-if="picked.kind === 'text'"
      type="button"
      class="setting-row"
      aria-label="Edit the text"
      @click="emit('edit', selected)"
    >
      <span>Text</span>
      <span class="value">Edit</span>
    </button>
    <button
      type="button"
      class="setting-row"
      :aria-label="`Size: ${picked.size}%`"
      aria-haspopup="dialog"
      @click="emit('open', selected, 'size')"
    >
      <span>Size</span>
      <span class="value">{{ picked.size }}%</span>
    </button>
    <button
      v-if="picked.kind === 'metric'"
      type="button"
      class="setting-row"
      :aria-label="`Label: ${labelChip}`"
      aria-haspopup="dialog"
      @click="emit('open', selected, 'label')"
    >
      <span>Label</span>
      <span class="value">{{ labelChip }}</span>
    </button>
    <button
      v-if="format"
      type="button"
      class="setting-row"
      :aria-label="`Format: ${FORMAT_NAMES[format]}`"
      aria-haspopup="dialog"
      @click="emit('open', selected, 'format')"
    >
      <span>Format</span>
      <span class="value">{{ FORMAT_NAMES[format] }}</span>
    </button>
    <button
      type="button"
      class="setting-row remove"
      aria-label="Remove from the picture"
      @click="emit('remove', selected)"
    >
      <span>Widget</span>
      <span class="value">Remove</span>
    </button>
  </div>
  <div v-else class="setting-rows widget-chips">
    <slot name="before" />
    <button
      type="button"
      class="setting-row"
      aria-label="Add a text"
      aria-haspopup="dialog"
      @click="emit('tool', 'text')"
    >
      <span>Add</span>
      <span class="value">Text</span>
    </button>
    <button
      type="button"
      class="setting-row"
      :aria-label="card ? 'Add a total' : 'Add a metric'"
      aria-haspopup="dialog"
      @click="emit('tool', 'values')"
    >
      <span>Add</span>
      <span class="value">{{ card ? 'Total' : 'Metric' }}</span>
    </button>
    <label v-if="chart.offered" class="setting-row">
      <span>Elevation chart</span>
      <span class="switch">
        <input
          type="checkbox"
          role="switch"
          aria-label="Elevation chart"
          :checked="chart.shown"
          @change="emit('tool', 'chart')"
        />
      </span>
    </label>
    <slot />
  </div>
</template>

<style scoped>
.widget-chips {
  display: contents;
}

/* Done: the way back to the section's chips, in the accent color. */
.setting-row.done {
  border-color: var(--accent);
  background: var(--accent);
}

.setting-row.done .value {
  color: #1a110b;
  font-weight: 700;
}

.setting-row.remove .value {
  color: #ff7b6b;
}
</style>
