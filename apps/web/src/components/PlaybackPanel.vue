<script setup lang="ts">
// How the routes play, past the preset (picked from the top bar, which also starts the
// playback over from it): the video's length and Fine-tune playback change the preset's
// values, which makes it Custom. A summary tells what will play.
import { SETTINGS } from '@wornways/engine';
import { computed, ref } from 'vue';
import {
  PLAYBACK_PANELS,
  PRESET_LABELS,
  countOf,
  fineTuned,
  playbackAdjustments,
  presetOf,
  settingHint,
  valueOf,
  type Adjustments,
} from '../adjust.ts';
import ExactNumber from './ExactNumber.vue';
import PacingLine from './PacingLine.vue';
import SettingsGroups from './SettingsGroups.vue';
import type { PlanReport } from '../messages.ts';

const props = defineProps<{
  activities: number;
  plan: PlanReport | null;
  /**
   * Phones: `rows` lists the length and Fine-tune's settings, a row each, and `open` asks
   * for one to be shown alone (`only`: "length" or a setting's name), in a sheet. Without
   * either, all of them, with Fine-tune folded.
   */
  view?: 'rows';
  only?: string;
}>();
const adjustments = defineModel<Adjustments>({ required: true });
const emit = defineEmits<{ open: [name: string, label: string] }>();

/** One activity gets its own presets; several get the others. */
const count = computed(() => countOf(props.activities));
const preset = computed(() => presetOf(adjustments.value, count.value));

/** The adjustments as changed below: a change to a value the preset sets makes it Custom. */
const tuned = computed({
  get: () => playbackAdjustments(adjustments.value, count.value),
  set: (after: Adjustments) =>
    (adjustments.value = fineTuned(adjustments.value, after, count.value)),
});

// The video's length, with its own slider; changing it is a change like under Fine-tune.
const DURATION = SETTINGS.find((s) => s.name === 'duration')!;
const durationRange =
  DURATION.kind.type === 'number' ? DURATION.kind : { min: 5, max: 60, unit: 's' };
const duration = computed(() => Number(valueOf(adjustments.value, DURATION, count.value)));
/** The length while its slider is dragged; the video changes when it is let go. */
const durationShown = ref<number | null>(null);
function setDuration(seconds: number): void {
  durationShown.value = null;
  tuned.value = { ...tuned.value, duration: String(seconds) };
}

const fineTuneOpen = ref(false);
</script>

<template>
  <!-- Phones: the list, a row per setting with its value. -->
  <div v-if="view === 'rows'" class="setting-rows">
    <button
      type="button"
      class="setting-row"
      :aria-label="`Length: ${duration} s`"
      aria-haspopup="dialog"
      @click="emit('open', 'length', 'Length')"
    >
      <span>Length</span>
      <span class="value">{{ duration }} s</span>
    </button>
    <SettingsGroups
      v-model="tuned"
      :groups="PLAYBACK_PANELS"
      :count="count"
      view="rows"
      @open="(name, label) => emit('open', name, label)"
    />
  </div>

  <!-- One of Fine-tune's settings alone, in a sheet. -->
  <SettingsGroups
    v-else-if="only && only !== 'length'"
    v-model="tuned"
    :groups="PLAYBACK_PANELS"
    :count="count"
    :only="only"
  />

  <div v-else class="settings">
    <div v-if="!only || only === 'length'" class="length">
      <div class="length-head">
        <div>
          <strong>Video length</strong>
          <p class="muted small">
            {{
              count === 'one'
                ? settingHint('duration', 'one')
                : 'How long the routes play, not counting the end card.'
            }}
          </p>
        </div>
        <ExactNumber
          label="Exact video length in seconds"
          :min="durationRange.min"
          :max="durationRange.max"
          :value="durationShown ?? duration"
          unit="s"
          @change="setDuration"
        />
      </div>
      <input
        type="range"
        :min="durationRange.min"
        :max="durationRange.max"
        step="1"
        :value="durationShown ?? duration"
        aria-label="Video length"
        @input="durationShown = Number(($event.target as HTMLInputElement).value)"
        @change="setDuration(Number(($event.target as HTMLInputElement).value))"
      />
    </div>

    <div class="summary" role="status">
      <span class="icon" aria-hidden="true">▶</span>
      <div>
        <span class="caption">Your replay</span>
        <strong data-testid="replay-summary">
          {{ Number((plan?.seconds ?? duration).toFixed(1)) }} seconds ·
          {{ preset === 'custom' ? 'Custom playback' : PRESET_LABELS[preset] }}
        </strong>
        <PacingLine v-if="plan" class="muted small" :plan="plan" />
      </div>
    </div>

    <div v-if="!only" class="fine-tune">
      <button
        type="button"
        class="fine-tune-toggle"
        :aria-expanded="fineTuneOpen"
        aria-controls="fine-tune-playback"
        @click="fineTuneOpen = !fineTuneOpen"
      >
        <span>
          <strong>Fine-tune playback</strong>
          <span class="muted small">
            {{
              fineTuneOpen ? 'Hide the detailed settings' : 'Optional: grouping, pace and camera'
            }}
          </span>
        </span>
        <span class="chevron" aria-hidden="true">{{ fineTuneOpen ? '⌃' : '⌄' }}</span>
      </button>
      <SettingsGroups
        v-if="fineTuneOpen"
        id="fine-tune-playback"
        v-model="tuned"
        class="fine-tune-panels"
        :groups="PLAYBACK_PANELS"
        :count="count"
      />
    </div>
  </div>
</template>

<style scoped>
.settings {
  min-width: 0;
}

.small {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
}

.length {
  padding: 1rem 1.2rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--panel);
  margin-bottom: 0.8rem;
}

.length-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.6rem;
}

.length input[type='range'] {
  width: 100%;
  accent-color: var(--accent);
}

.summary {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  margin-bottom: 1.2rem;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(255, 138, 42, 0.35);
  border-radius: 12px;
  background: rgba(255, 138, 42, 0.07);
}

.summary .icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 2.3rem;
  height: 2.3rem;
  border-radius: 10px;
  color: var(--accent);
  background: rgba(255, 138, 42, 0.15);
  font-size: 0.85rem;
}

.summary .caption {
  display: block;
  color: var(--accent);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.fine-tune {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--panel);
  overflow: hidden;
}

.fine-tune-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  padding: 1rem 1.2rem;
  border: 0;
  color: var(--text);
  background: transparent;
  text-align: left;
  font: inherit;
}

.fine-tune-toggle > span:first-child {
  display: flex;
  flex-direction: column;
}

.chevron {
  color: var(--muted);
  font-size: 1.3rem;
}

.fine-tune-panels {
  padding: 0 0.8rem 0.8rem;
}
</style>
