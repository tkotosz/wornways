<script setup lang="ts">
// One widget's settings: the text of a text widget (the title until another is written),
// its size, where a value shows its words and what they say, whether it shows its unit, how a
// time, a date or a clock time is written (on the totals card, `card`, a time in hours unless
// picked), its icon on or off, a chart's color, and removing it from the picture. With `only`, just one of
// them, as the strip's chips open them.
import {
  CHART_COLORS,
  WIDGET_SIZE,
  chartColors,
  defaultChartColor,
  LABEL_MODES,
  formatsOf,
  hasUnit,
  labelTextOf,
  valueLines,
  type LabelMode,
  type Metric,
  type MetricValue,
  type ValueFormat,
  type Widget,
} from '@wornways/engine';
import { computed } from 'vue';
import {
  COLOR_NAMES,
  FORMAT_NAMES,
  LABEL_MODE_NAMES,
  formatOf,
  type WidgetPart,
} from '../adjust.ts';
import ExactNumber from './ExactNumber.vue';

const props = defineProps<{
  widget: Widget;
  title: string;
  values: Map<Metric, MetricValue>;
  card: boolean;
  only?: WidgetPart;
}>();
const emit = defineEmits<{ change: [widget: Widget]; remove: [] }>();

function set(changed: Partial<Widget>): void {
  emit('change', { ...props.widget, ...changed } as Widget);
}

/** The label modes the value can take, each with how the value reads in it. */
const modes = computed(() => {
  const widget = props.widget;
  if (widget.kind !== 'metric') return [];
  const value = props.values.get(widget.metric);
  return LABEL_MODES.map((mode: LabelMode) => {
    const lines = value
      ? valueLines(value, mode, widget.format, widget.labelText, widget.unit)
      : null;
    return {
      mode,
      example: lines ? [lines.above, lines.line, lines.under].filter(Boolean).join(' / ') : '',
    };
  });
});
/** The value's usual words, in its format: what its own words take the place of. */
const usualWords = computed(() => {
  const widget = props.widget;
  if (widget.kind !== 'metric') return '';
  const value = props.values.get(widget.metric);
  return value ? labelTextOf(value, undefined, widget.format) : '';
});
/**
 * The formats the value can be written in, each with how it reads: the value alone over the
 * replay, with its words on the totals card, where they say the unit.
 */
const formats = computed(() => {
  const widget = props.widget;
  if (widget.kind !== 'metric') return [];
  const value = props.values.get(widget.metric);
  return formatsOf(widget.metric).map((format: ValueFormat) => {
    const text = value?.formats?.[format];
    return {
      format,
      example: text?.value ?? '',
    };
  });
});
const currentFormat = computed(() => formatOf(props.widget, props.card));
/** The value with its unit and without, when it has one; none otherwise. */
const unitChoices = computed(() => {
  const widget = props.widget;
  if (widget.kind !== 'metric') return [];
  const value = props.values.get(widget.metric);
  const format = currentFormat.value ?? undefined;
  if (!value || !hasUnit(value, format)) return [];
  const text = (format && value.formats?.[format]) || value;
  return [
    { shown: true, name: 'On', example: text.value },
    { shown: false, name: 'Off', example: text.number },
  ];
});
/**
 * The sizes the Size sheet sets: a chart's width and height apart (its height kept only while
 * it differs), any other widget's size.
 */
const sizeParts = computed(() => {
  const widget = props.widget;
  if (widget.kind !== 'chart')
    return [{ label: 'Size', value: widget.size, set: (size: number) => set({ size }) }];
  const height = widget.height ?? widget.size;
  return [
    {
      label: 'Width',
      value: widget.size,
      set: (size: number) => set({ size, height: height === size ? undefined : height }),
    },
    {
      label: 'Height',
      value: height,
      set: (value: number) => set({ height: value === widget.size ? undefined : value }),
    },
  ];
});
const shows = (part: WidgetPart) => !props.only || props.only === part;
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
      <span id="widget-label" class="label" :class="{ 'visually-hidden': only }">
        Label position
      </span>
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
    <div v-if="shows('words') && widget.kind === 'metric'" class="field">
      <span id="widget-words" class="label" :class="{ 'visually-hidden': only }">Label text</span>
      <input
        type="text"
        aria-labelledby="widget-words"
        :value="widget.labelText ?? usualWords"
        :placeholder="usualWords ? `No words (usually “${usualWords}”)` : 'No words'"
        @input="set({ labelText: ($event.target as HTMLInputElement).value })"
      />
      <button
        v-if="widget.labelText !== undefined && widget.labelText !== usualWords"
        type="button"
        class="link"
        @click="set({ labelText: undefined })"
      >
        Use the usual words, “{{ usualWords }}”
      </button>
    </div>
    <label
      v-if="!only && (widget.kind === 'metric' || widget.kind === 'chart')"
      class="field icon-switch"
    >
      <span class="label">Icon</span>
      <span class="switch">
        <input
          type="checkbox"
          role="switch"
          aria-label="Icon"
          :checked="!!widget.icon"
          @change="set({ icon: !widget.icon })"
        />
      </span>
    </label>
    <div v-if="shows('unit') && unitChoices.length" class="field">
      <span id="widget-unit" class="label" :class="{ 'visually-hidden': only }">Unit</span>
      <div class="modes" role="radiogroup" aria-labelledby="widget-unit">
        <button
          v-for="u in unitChoices"
          :key="u.name"
          type="button"
          class="mode"
          role="radio"
          :aria-checked="(widget.kind === 'metric' && widget.unit !== false) === u.shown"
          @click="set({ unit: u.shown ? undefined : false })"
        >
          <span>{{ u.name }}</span>
          <span class="example">{{ u.example }}</span>
        </button>
      </div>
    </div>
    <div v-if="shows('format') && formats.length" class="field">
      <span id="widget-format" class="label" :class="{ 'visually-hidden': only }">Format</span>
      <div class="modes" role="radiogroup" aria-labelledby="widget-format">
        <button
          v-for="f in formats"
          :key="f.format"
          type="button"
          class="mode"
          role="radio"
          :aria-checked="currentFormat === f.format"
          @click="set({ format: f.format })"
        >
          <span>{{ FORMAT_NAMES[f.format] }}</span>
          <span class="example">{{ f.example }}</span>
        </button>
      </div>
    </div>
    <div v-if="shows('color') && widget.kind === 'chart'" class="field">
      <span id="widget-color" class="label" :class="{ 'visually-hidden': only }">Color</span>
      <div class="swatches" role="radiogroup" aria-labelledby="widget-color">
        <button
          v-for="color in CHART_COLORS"
          :key="color"
          type="button"
          class="swatch"
          role="radio"
          :aria-checked="(widget.color ?? defaultChartColor(widget.chart)) === color"
          :aria-label="COLOR_NAMES[color]"
          :style="{ '--swatch': `rgb(${chartColors(color).line})` }"
          @click="set({ color })"
        >
          <span class="dot" aria-hidden="true" />
          <span>{{ COLOR_NAMES[color] }}</span>
        </button>
      </div>
    </div>
    <div v-if="shows('size')" class="field">
      <span id="widget-size" class="label" :class="{ 'visually-hidden': only }">Size</span>
      <!-- A chart's width and height apart; any other widget's size, both ways together. -->
      <div
        v-for="part in sizeParts"
        :key="part.label"
        class="slider"
        role="group"
        :aria-label="part.label"
      >
        <span v-if="sizeParts.length > 1" class="muted part">{{ part.label }}</span>
        <input
          type="range"
          :min="WIDGET_SIZE.min"
          :max="WIDGET_SIZE.max"
          step="5"
          :value="part.value"
          :aria-label="part.label"
          @change="part.set(Number(($event.target as HTMLInputElement).value))"
        />
        <ExactNumber
          :label="`Exact ${part.label.toLowerCase()} (%)`"
          :min="WIDGET_SIZE.min"
          :max="WIDGET_SIZE.max"
          :value="part.value"
          unit="%"
          @change="part.set($event)"
        />
      </div>
      <p class="muted hint">
        {{
          sizeParts.length > 1
            ? 'Or pinch it on the picture, or drag its corner, its right edge or its top edge.'
            : 'Or pinch it on the picture, or drag its corner.'
        }}
      </p>
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

.slider .part {
  width: 3.2rem;
  font-size: 0.8rem;
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
.icon-switch {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.swatches {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

/* A color: its dot over its name; the one in use outlined in it. */
.swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.55rem 0.2rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--muted);
  background: none;
  font: inherit;
  font-size: 0.75rem;
}

.swatch[aria-checked='true'] {
  border-color: var(--swatch);
  color: var(--text);
}

.swatch .dot {
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  background: var(--swatch);
}
</style>
