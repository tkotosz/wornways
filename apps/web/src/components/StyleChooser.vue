<script setup lang="ts">
// How the video plays, asked each time the Design step is opened from Activities: the
// presets this many activities can take, as cards with a drawing of how each plays, and none
// picked. The style decides what the video is, so it is always chosen, not a default left
// in place; picking one opens the editor, where Playback › Style changes it later. Playback
// set by hand (Custom) can be kept as it is.
import { computed } from 'vue';
import {
  PRESET_LABELS,
  PRESET_LINES,
  countOf,
  presetChoices,
  presetOf,
  withPreset,
  type Adjustments,
  type PresetChoice,
} from '../adjust.ts';
import { countText } from '../format.ts';
import type { PlanReport } from '../messages.ts';
import PresetDrawing from './PresetDrawing.vue';

const props = defineProps<{ activities: number; plan: PlanReport | null }>();
const adjustments = defineModel<Adjustments>({ required: true });
const emit = defineEmits<{ chosen: [] }>();

const count = computed(() => countOf(props.activities));
/** The playback set by hand, which is offered to keep. */
const custom = computed(() => presetOf(adjustments.value, count.value) === 'custom');

function pick(preset: PresetChoice): void {
  if (preset !== 'custom') adjustments.value = withPreset(adjustments.value, preset, count.value);
  emit('chosen');
}
</script>

<template>
  <section class="chooser" aria-labelledby="style-heading">
    <h1 id="style-heading">How should it play?</h1>
    <p class="muted lead">
      {{ countText(activities, 'activity', 'activities') }}. Pick a style; you can fine-tune it
      next.
    </p>
    <div class="cards">
      <button
        v-for="preset in presetChoices(count)"
        :key="preset"
        type="button"
        class="card"
        @click="pick(preset)"
      >
        <PresetDrawing class="drawing" :preset="preset" />
        <span class="text">
          <strong>{{ PRESET_LABELS[preset] }}</strong>
          <span class="muted">{{ PRESET_LINES[preset] }}</span>
        </span>
        <span class="go" aria-hidden="true">›</span>
      </button>
      <button v-if="custom" type="button" class="card" @click="pick('custom')">
        <span class="text">
          <strong>Keep my own playback</strong>
          <span class="muted">The timing and camera as you set them.</span>
        </span>
        <span class="go" aria-hidden="true">›</span>
      </button>
    </div>
    <p class="muted later">You can change it later under Playback › Style.</p>
  </section>
</template>

<style scoped>
.chooser {
  max-width: 36rem;
}

.chooser h1 {
  margin: 0 0 0.3rem;
}

.lead {
  margin: 0 0 1.2rem;
}

.cards {
  display: grid;
  gap: 0.7rem;
}

/* A card: the drawing, the name and its line, an arrow that says it goes on. */
.card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  color: var(--text);
  background: var(--panel);
  text-align: left;
  font: inherit;
}

.card:hover,
.card:focus-visible {
  border-color: var(--accent);
  outline: none;
}

.drawing {
  flex: none;
  width: 3.6rem;
}

.text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.2rem;
}

.text .muted {
  font-size: 0.85rem;
}

.go {
  color: var(--muted);
  font-size: 1.4rem;
}

.later {
  margin: 1rem 0 0;
  font-size: 0.85rem;
}
</style>
