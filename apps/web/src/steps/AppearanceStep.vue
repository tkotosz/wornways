<script setup lang="ts">
// Step 4: how the video looks: its frame (shape and frames per second), the title, the
// metrics, the map and the branding, with a live preview of the finished picture.
import { SETTINGS, SIZE_PRESETS, parseFrameSize, type SettingsInput } from '@wornways/engine';
import { computed, ref } from 'vue';
import {
  APPEARANCE_PANELS,
  FRAME_RATES,
  SIZE_LABELS,
  countOf,
  type Adjustments,
} from '../adjust.ts';
import PosterPreview from '../components/PosterPreview.vue';
import SettingsGroups from '../components/SettingsGroups.vue';
import type { EngineClient } from '../engine-client.ts';
import type { PlanReport } from '../messages.ts';

defineProps<{
  engine: EngineClient;
  /** The settings of the whole video, for the preview. */
  settings: SettingsInput;
  activities: number;
  plan: PlanReport | null;
}>();
const adjustments = defineModel<Adjustments>({ required: true });
const emit = defineEmits<{ back: []; next: [] }>();

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
  <section>
    <h1>Make it yours</h1>
    <p class="muted">
      Set the frame and what is shown on the video. The preview follows your changes.
    </p>

    <div class="layout">
      <PosterPreview
        class="preview"
        :engine="engine"
        :settings="settings"
        :seconds="plan?.seconds"
      />
      <div class="settings">
        <!-- The frame: where the video will be posted decides its shape. -->
        <div class="frame" data-testid="frame">
          <h2>Frame</h2>
          <div class="row">
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
          <div class="row">
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

        <SettingsGroups
          v-model="adjustments"
          :groups="APPEARANCE_PANELS"
          :count="countOf(activities)"
          :plan="plan"
        />
      </div>
    </div>

    <div class="footer">
      <button type="button" class="secondary" @click="emit('back')">← Back</button>
      <button type="button" class="primary" @click="emit('next')">Continue →</button>
    </div>
  </section>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 17rem 1fr;
  gap: 1.5rem;
  align-items: start;
  margin-top: 1.5rem;
}

.settings {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* A box like the settings panels below it. */
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

/* Phones: one column, the preview first so each change shows at once. */
@media (max-width: 760px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
