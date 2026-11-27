<script setup lang="ts">
// The video's frame: its shape and size, where it will be posted decides them, and its frame
// rate.
import { SETTINGS, SIZE_PRESETS, parseFrameSize } from '@wornways/engine';
import { computed, ref } from 'vue';
import { FRAME_RATES, SIZE_LABELS, type Adjustments } from '../adjust.ts';

/**
 * Phones: `rows` lists the shape and the frame rate, a row each with its value, and `open`
 * asks for one to be shown alone (`only`), in a sheet. Without either, both in a box.
 */
/** `only`: "size" or "fps". */
defineProps<{ view?: 'rows'; only?: string }>();
const adjustments = defineModel<Adjustments>({ required: true });
const emit = defineEmits<{ open: [name: string, label: string] }>();

const size = computed(() =>
  String(adjustments.value['size'] ?? SETTINGS.find((s) => s.name === 'size')!.default),
);
const fps = computed(() =>
  String(adjustments.value['fps'] ?? SETTINGS.find((s) => s.name === 'fps')!.default),
);
const sizeDraft = ref<string | null>(null);
const sizeError = ref('');

function set(name: 'size' | 'fps', value: string): void {
  adjustments.value = { ...adjustments.value, [name]: value };
}

function pickSize(value: string): void {
  sizeDraft.value = null;
  sizeError.value = '';
  set('size', value);
}

function applySize(): void {
  try {
    const [width, height] = parseFrameSize(sizeDraft.value?.trim() ?? '');
    pickSize(`${width}x${height}`);
  } catch (error) {
    sizeError.value = error instanceof Error ? error.message : String(error);
  }
}

function editSize(): void {
  if (sizeDraft.value !== null) return;
  sizeDraft.value = Object.hasOwn(SIZE_PRESETS, size.value)
    ? SIZE_PRESETS[size.value]!.join('x')
    : size.value;
}
</script>

<template>
  <!-- Phones: the list, a row per setting with its value. -->
  <div v-if="view === 'rows'" class="setting-rows">
    <button
      v-for="row in [
        { name: 'size', label: 'Shape', value: SIZE_LABELS[size] ?? size },
        { name: 'fps', label: 'Frame rate', value: `${fps} fps` },
      ]"
      :key="row.name"
      type="button"
      class="setting-row"
      :aria-label="`${row.label}: ${row.value}`"
      aria-haspopup="dialog"
      @click="emit('open', row.name, row.label)"
    >
      <span>{{ row.label }}</span>
      <span class="value">{{ row.value }}</span>
    </button>
  </div>

  <div v-else class="frame" :class="{ one: only }" data-testid="frame">
    <h2 v-if="!only">Frame</h2>
    <div v-if="!only || only === 'size'" class="row">
      <span class="label">Aspect ratio</span>
      <div class="chips" role="group" aria-label="Aspect ratio">
        <button
          v-for="name in Object.keys(SIZE_PRESETS)"
          :key="name"
          type="button"
          class="chip"
          :aria-pressed="sizeDraft === null && size === name"
          @click="pickSize(name)"
        >
          {{ SIZE_LABELS[name] ?? name }}
        </button>
        <button
          type="button"
          class="chip"
          :aria-pressed="sizeDraft !== null || !Object.hasOwn(SIZE_PRESETS, size)"
          @click="editSize"
        >
          Custom size
        </button>
      </div>
      <form
        v-if="sizeDraft !== null || !Object.hasOwn(SIZE_PRESETS, size)"
        class="chips"
        @submit.prevent="applySize"
      >
        <input
          type="text"
          aria-label="Frame size in pixels"
          placeholder="Width x height"
          :value="sizeDraft ?? size"
          :aria-invalid="!!sizeError"
          @input="
            sizeDraft = ($event.target as HTMLInputElement).value;
            sizeError = '';
          "
        />
        <button type="submit" class="secondary" :disabled="sizeDraft === null">Apply</button>
      </form>
      <p v-if="sizeError" class="error" role="alert">{{ sizeError }}</p>
    </div>
    <div v-if="!only || only === 'fps'" class="row">
      <span class="label">Frame rate</span>
      <div class="chips" role="group" aria-label="Frame rate">
        <button
          v-for="rate in FRAME_RATES"
          :key="rate"
          type="button"
          class="chip"
          :aria-pressed="fps === rate"
          @click="set('fps', rate)"
        >
          {{ rate }} fps
        </button>
      </div>
      <p class="hint muted">
        30 fps works well for most videos; 60 fps is smoother but makes larger files.
      </p>
    </div>
  </div>
</template>

<style scoped>
/* A box like the settings panels. */
.frame {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 1.2rem;
  border-radius: 14px;
  background: var(--panel);
}

.frame h2 {
  margin: 0;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.hint {
  margin: 0;
  font-size: 0.85rem;
}

.chips input {
  min-width: 0;
  max-width: 100%;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.4rem 0.6rem;
  background: var(--background);
  color: var(--text);
  font: inherit;
}

/* One setting alone, in a sheet that names it: no box, heading or label. */
.frame.one {
  padding: 0;
  background: none;
}

.frame.one .label {
  display: none;
}
</style>
