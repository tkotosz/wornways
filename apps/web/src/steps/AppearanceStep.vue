<script setup lang="ts">
// Step 4: how the video looks: its frame (shape and frames per second), the title, the
// metrics, the map and the branding, with a live preview of the finished picture.
import type { SettingsInput } from '@wornways/engine';
import { APPEARANCE_PANELS, FRAME_RATES, SIZE_LABELS, type Adjustments } from '../adjust.ts';
import PosterPreview from '../components/PosterPreview.vue';
import SettingsGroups from '../components/SettingsGroups.vue';
import type { EngineClient } from '../engine-client.ts';
import type { ActivitySummary } from '../messages.ts';

defineProps<{
  engine: EngineClient;
  /** The settings of the whole video, for the preview. */
  settings: SettingsInput;
  /** The activities the video shows, in date order. */
  chosen: ActivitySummary[];
  /** The chosen period, for the automatic title; null where open. */
  period: { from: number | null; to: number | null };
}>();
const adjustments = defineModel<Adjustments>({ required: true });
const emit = defineEmits<{ back: []; next: [] }>();

const size = () => String(adjustments.value['size'] ?? 'story');
const fps = () => String(adjustments.value['fps'] ?? '30');

function set(name: 'size' | 'fps', value: string): void {
  adjustments.value = { ...adjustments.value, [name]: value };
}
</script>

<template>
  <section>
    <h1>Make it yours</h1>
    <p class="muted">
      Set the frame and what is shown on the video. The preview follows your changes.
    </p>

    <div class="layout">
      <PosterPreview class="preview" :engine="engine" :settings="settings" />
      <div class="settings">
        <!-- The frame: where the video will be posted decides its shape. -->
        <div class="frame" data-testid="frame">
          <h2>Frame</h2>
          <div class="row">
            <span class="label">Aspect ratio</span>
            <div class="chips" role="group" aria-label="Aspect ratio">
              <button
                v-for="(label, name) in SIZE_LABELS"
                :key="name"
                type="button"
                class="chip"
                :aria-pressed="size() === name"
                @click="set('size', name)"
              >
                {{ label }}
              </button>
            </div>
          </div>
          <div class="row">
            <span class="label">Frame rate</span>
            <div class="chips" role="group" aria-label="Frame rate">
              <button
                v-for="rate in FRAME_RATES"
                :key="rate"
                type="button"
                class="chip"
                :aria-pressed="fps() === rate"
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
          :chosen="chosen"
          :period="period"
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

/* Phones: one column, the preview first so each change shows at once. */
@media (max-width: 760px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
