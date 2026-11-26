<script setup lang="ts">
// How the video plays: the presets this many activities can take, as cards with a drawing of
// how each plays. It is asked when the editor is set up for a new kind of selection (the
// first one, or a change between one activity and several), with none picked and no way to
// close it: the style decides what the video is, so it is always chosen, not a default left
// in place. From the top bar it changes the preset, with the current one marked. Playback
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
import AppPopup from '../components/AppPopup.vue';
import PresetDrawing from '../components/PresetDrawing.vue';
import { countText } from '../format.ts';

const props = defineProps<{ activities: number; closable: boolean }>();
const adjustments = defineModel<Adjustments>({ required: true });
const emit = defineEmits<{ chosen: []; close: []; menu: [] }>();

const count = computed(() => countOf(props.activities));
/** The preset in use, marked when the popup only changes it. */
const current = computed(() => presetOf(adjustments.value, count.value));
/** The playback set by hand, which is offered to keep. */
const custom = computed(() => current.value === 'custom');

function pick(preset: PresetChoice): void {
  if (preset !== 'custom') adjustments.value = withPreset(adjustments.value, preset, count.value);
  emit('chosen');
}
</script>

<template>
  <AppPopup
    title="How should it play?"
    :closable="closable"
    narrow
    @close="emit('close')"
    @menu="emit('menu')"
  >
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
        :aria-current="closable && preset === current ? 'true' : undefined"
        @click="pick(preset)"
      >
        <PresetDrawing class="drawing" :preset="preset" />
        <span class="text">
          <strong>{{ PRESET_LABELS[preset] }}</strong>
          <span class="muted">{{ PRESET_LINES[preset] }}</span>
        </span>
        <span class="go" aria-hidden="true">›</span>
      </button>
      <button
        v-if="custom"
        type="button"
        class="card"
        :aria-current="closable ? 'true' : undefined"
        @click="pick('custom')"
      >
        <span class="text">
          <strong>Keep my own playback</strong>
          <span class="muted">The timing and camera as you set them.</span>
        </span>
        <span class="go" aria-hidden="true">›</span>
      </button>
    </div>
    <p class="muted later">You can change it later here, or under Playback › Style.</p>
  </AppPopup>
</template>

<style scoped>
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
.card:focus-visible,
.card[aria-current] {
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
