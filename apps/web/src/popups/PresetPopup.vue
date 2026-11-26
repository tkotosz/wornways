<script setup lang="ts">
// How the video plays: the presets this many activities can take, as cards with a drawing of
// how each plays. It is asked when the editor is set up for a new kind of selection (the
// first one, or a change between one activity and several), with none picked and no way to
// close it: the style decides what the video is, so it is always chosen, not a default left
// in place. From the top bar it changes the preset, with the current one marked. Playback
// set by hand (Custom) can be kept as it is. Under a preset, Reset puts the video back as the
// preset starts it (see `resetToPreset`), asked once more before it does.
import { computed, ref } from 'vue';
import {
  PRESET_LABELS,
  PRESET_LINES,
  countOf,
  presetChoices,
  presetOf,
  resetToPreset,
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

/** Whether Reset was tapped once, and asks to be tapped again. */
const confirming = ref(false);

function reset(): void {
  const preset = current.value;
  if (preset === 'custom') return;
  adjustments.value = resetToPreset(adjustments.value, preset, count.value);
  confirming.value = false;
  emit('chosen');
}

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
    <p v-if="!closable" class="muted later">You can change it later from Preset in the top bar.</p>
    <!-- Under a preset: back to how it starts the video, asked once more. -->
    <section v-if="closable && !custom" class="reset" aria-label="Reset">
      <button v-if="!confirming" type="button" class="secondary" @click="confirming = true">
        Reset to {{ PRESET_LABELS[current] }}
      </button>
      <template v-else>
        <p class="muted">
          The playback, the widgets, the layout and the totals card start over as
          {{ PRESET_LABELS[current] }} sets them. The frame, units, map and ending stay.
        </p>
        <div class="confirm">
          <button type="button" class="secondary" @click="confirming = false">Cancel</button>
          <button type="button" class="primary" @click="reset">Reset</button>
        </div>
      </template>
    </section>
  </AppPopup>
</template>

<style scoped>
.reset {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: 1.4rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
}

.reset p {
  margin: 0;
  font-size: 0.85rem;
}

.confirm {
  display: flex;
  gap: 0.6rem;
}

.confirm button {
  flex: 1;
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
