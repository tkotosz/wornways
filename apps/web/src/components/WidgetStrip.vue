<script setup lang="ts">
// The chips for arranging widgets, in the strip under the picture (Overlay, and Ending with
// the totals card). With no widget picked: adding a text, a stat or (over the replay) a
// chart. With one picked, the strip is that widget's: Done lets it go; Edit writes a
// text's text; Size, Label position (where a value's words are), Label text (what they say),
// Unit (on or off, for a value that has one) and Format (a time, date or clock time) open
// their sheet; Icon turns a value's icon on or off in place; Remove takes it off the picture. The section's own settings
// stay in the slot, after the tools.
import { hasUnit, labelTextOf, type Metric, type MetricValue, type Widget } from '@wornways/engine';
import { computed } from 'vue';
import { FORMAT_NAMES, LABEL_MODE_NAMES, formatOf, type WidgetPart } from '../adjust.ts';

const props = defineProps<{
  widgets: Widget[];
  selected: number | null;
  /** The totals card's widgets: values are its totals, with no label modes and no chart. */
  card: boolean;
  /** The values the widgets show, to tell which have a unit. */
  values: Map<Metric, MetricValue>;
  /** Whether charts are offered: over the replay, when the activities can show one. */
  charts: boolean;
}>();
const emit = defineEmits<{
  /** Lets the picked widget go. */
  done: [];
  /** Adds a text, or opens the values or the charts to add one. */
  tool: [tool: 'text' | 'values' | 'charts'];
  /** Writes the picked text widget's text. */
  edit: [index: number];
  /** Changes the picked widget in place, as its icon switch does. */
  change: [index: number, widget: Widget];
  /** Opens a part of the picked widget's settings in a sheet. */
  open: [index: number, what: WidgetPart];
  remove: [index: number];
}>();

const picked = computed(() =>
  props.selected === null ? null : (props.widgets[props.selected] ?? null),
);
/** The picked value's label chips: where its words are, and the words ("None" for none). */
const labelChip = computed(() =>
  picked.value?.kind === 'metric' ? LABEL_MODE_NAMES[picked.value.label] : '',
);
const wordsChip = computed(() => {
  const widget = picked.value;
  if (widget?.kind !== 'metric') return '';
  const value = props.values.get(widget.metric);
  const format = formatOf(widget, props.card) ?? undefined;
  const words = value ? labelTextOf(value, widget.labelText, format) : (widget.labelText ?? '');
  return words || 'None';
});
/** Whether the picked value shows its unit, when it has one: null when it has none. */
const unit = computed(() => {
  const widget = picked.value;
  if (widget?.kind !== 'metric') return null;
  const value = props.values.get(widget.metric);
  if (!value || !hasUnit(value, formatOf(widget, props.card) ?? undefined)) return null;
  return widget.unit === false ? 'Off' : 'On';
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
      :aria-label="`Label position: ${labelChip}`"
      aria-haspopup="dialog"
      @click="emit('open', selected, 'label')"
    >
      <span>Label position</span>
      <span class="value">{{ labelChip }}</span>
    </button>
    <button
      v-if="picked.kind === 'metric'"
      type="button"
      class="setting-row"
      :aria-label="`Label text: ${wordsChip}`"
      aria-haspopup="dialog"
      @click="emit('open', selected, 'words')"
    >
      <span>Label text</span>
      <span class="value words">{{ wordsChip }}</span>
    </button>
    <label v-if="picked.kind === 'metric'" class="setting-row">
      <span>Icon</span>
      <span class="switch">
        <input
          type="checkbox"
          role="switch"
          aria-label="Icon"
          :checked="!!picked.icon"
          @change="emit('change', selected, { ...picked, icon: !picked.icon })"
        />
      </span>
    </label>
    <button
      v-if="unit"
      type="button"
      class="setting-row"
      :aria-label="`Unit: ${unit}`"
      aria-haspopup="dialog"
      @click="emit('open', selected, 'unit')"
    >
      <span>Unit</span>
      <span class="value">{{ unit }}</span>
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
      :aria-label="card ? 'Add a total' : 'Add a stat'"
      aria-haspopup="dialog"
      @click="emit('tool', 'values')"
    >
      <span>Add</span>
      <span class="value">{{ card ? 'Total' : 'Stat' }}</span>
    </button>
    <button
      v-if="charts"
      type="button"
      class="setting-row"
      aria-label="Add a chart"
      aria-haspopup="dialog"
      @click="emit('tool', 'charts')"
    >
      <span>Add</span>
      <span class="value">Chart</span>
    </button>
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
