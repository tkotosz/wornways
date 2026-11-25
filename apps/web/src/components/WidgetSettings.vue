<script setup lang="ts">
// One widget's settings: the text of a text widget (the title until another is written),
// its size, and removing it from the picture.
import { WIDGET_SIZE, type Widget } from '@wornways/engine';
import ExactNumber from './ExactNumber.vue';

const props = defineProps<{ widget: Widget; title: string }>();
const emit = defineEmits<{ change: [widget: Widget]; remove: [] }>();

function set(changed: Partial<Widget>): void {
  emit('change', { ...props.widget, ...changed } as Widget);
}
</script>

<template>
  <div class="widget-settings">
    <div v-if="widget.kind === 'text'" class="field">
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
    <div class="field">
      <span id="widget-size" class="label">Size</span>
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
    <button type="button" class="secondary remove" @click="emit('remove')">
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

.remove {
  border-color: #6b2a24;
  color: #ff7b6b;
}
</style>
