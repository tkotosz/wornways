<script setup lang="ts">
// How the routes play. A preset is enough; the video's length and Fine-tune playback change
// its values, which makes it Custom. A summary tells what will play.
import { SETTINGS } from '@wornways/engine';
import { computed, ref } from 'vue';
import {
  PLAYBACK_PANELS,
  PRESET_LABELS,
  PRESET_LINES,
  countOf,
  fineTuned,
  playbackAdjustments,
  presetChoices,
  presetOf,
  resetPlayback,
  settingHint,
  valueOf,
  withPreset,
  type Adjustments,
  type PlaybackPart,
  type PresetChoice,
} from '../adjust.ts';
import ExactNumber from './ExactNumber.vue';
import PacingLine from './PacingLine.vue';
import PresetDrawing from './PresetDrawing.vue';
import SettingsGroups from './SettingsGroups.vue';
import type { PlanReport } from '../messages.ts';

const props = defineProps<{
  activities: number;
  plan: PlanReport | null;
  /**
   * Phones: one part at a time, compact: the presets on a sideways row, the length, or one
   * of Fine-tune's groups. Without it, all of them, with Fine-tune folded.
   */
  part?: PlaybackPart;
}>();
const adjustments = defineModel<Adjustments>({ required: true });

/** One activity gets its own presets; several get the others. */
const count = computed(() => countOf(props.activities));
const preset = computed(() => presetOf(adjustments.value, count.value));

function pick(picked: PresetChoice): void {
  adjustments.value = withPreset(adjustments.value, picked, count.value);
}

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
  <div class="settings" :class="{ compact: part }">
    <h2 v-if="!part" class="kicker">Playback style</h2>
    <div v-if="!part || part === 'style'" class="presets" role="radiogroup" aria-label="Preset">
      <button
        v-for="name in presetChoices(count)"
        :key="name"
        type="button"
        role="radio"
        class="preset"
        :aria-checked="preset === name"
        @click="pick(name)"
      >
        <PresetDrawing class="drawing" :preset="name" />
        <span class="text">
          <strong>{{ PRESET_LABELS[name] }}</strong>
          <span v-if="!part" class="muted">{{ PRESET_LINES[name] }}</span>
        </span>
        <span v-if="preset === name" class="check" aria-hidden="true">✓</span>
      </button>
    </div>

    <!-- Phones: the picked preset's line under the row of small cards. -->
    <p v-if="part === 'style'" class="muted small" data-testid="preset-line">
      {{
        preset === 'custom'
          ? 'Your own timing and camera, set under Timing and Camera.'
          : PRESET_LINES[preset]
      }}
    </p>

    <!-- Phones: the length as a row like the other settings, with what the video plays. -->
    <template v-if="part === 'length'">
      <div class="length-row">
        <span id="label-length" class="label">Length</span>
        <div class="slider" role="group" aria-labelledby="label-length">
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
          <ExactNumber
            label="Exact video length in seconds"
            :min="durationRange.min"
            :max="durationRange.max"
            :value="durationShown ?? duration"
            unit="s"
            @change="setDuration"
          />
        </div>
      </div>
      <PacingLine v-if="plan" class="muted small" :plan="plan" />
    </template>

    <div v-if="!part" class="length">
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

    <div v-if="!part" class="summary" role="status">
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

    <!-- Phones: Fine-tune's groups are tabs of their own. -->
    <template v-if="part === 'timing' || part === 'camera'">
      <SettingsGroups v-model="tuned" :groups="[part]" :count="count" compact />
      <button
        v-if="part === 'timing'"
        type="button"
        class="link reset"
        @click="adjustments = resetPlayback(adjustments, count)"
      >
        Reset playback to defaults
      </button>
    </template>

    <div v-if="!part" class="fine-tune">
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
      <button
        v-if="fineTuneOpen"
        type="button"
        class="link"
        @click="adjustments = resetPlayback(adjustments, count)"
      >
        Reset playback to defaults
      </button>
    </div>
  </div>
</template>

<style scoped>
.settings {
  min-width: 0;
}

.kicker {
  margin: 0 0 0.8rem;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.small {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
}

.presets {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: 0.8rem;
  margin-bottom: 1.2rem;
}

/* A card: the drawing above, the name and its line under it, a check when picked. */
.preset {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.8rem;
  padding: 1.1rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  color: var(--text);
  background: var(--panel);
  text-align: left;
  font: inherit;
}

.preset[aria-checked='true'] {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
  background: linear-gradient(160deg, rgba(255, 138, 42, 0.1), var(--panel));
}

.drawing {
  width: 4.2rem;
}

.text {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding-right: 1.4rem;
}

.text .muted {
  font-size: 0.82rem;
}

.check {
  position: absolute;
  top: 0.9rem;
  right: 0.9rem;
  display: grid;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  color: #1a110b;
  background: var(--accent);
  font-size: 0.8rem;
  font-weight: 800;
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

.fine-tune .link {
  margin: 0 0.8rem 0.8rem;
}

/* Phones: the cards as rows, the drawing beside the text. */
@media (max-width: 600px) {
  .presets {
    grid-template-columns: 1fr;
  }

  .preset {
    flex-direction: row;
    align-items: center;
  }

  .drawing {
    flex: none;
    width: 3.4rem;
  }
}

/* Phones, one part at a time: no boxes; the presets as chips like the other choices, on a
   row that scrolls sideways, the picked one's line under them; the length as a row like the other settings. */
.compact .presets {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
  overflow-x: auto;
  scrollbar-width: none;
}

.compact .preset {
  flex: none;
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  box-shadow: none;
  color: var(--muted);
  background: transparent;
}

.compact .preset[aria-checked='true'] {
  color: var(--text);
  background: rgba(255, 138, 42, 0.12);
}

.compact .drawing,
.compact .check {
  display: none;
}

.compact .text {
  padding-right: 0;
  white-space: nowrap;
}

.compact .text strong {
  font-weight: 400;
}

.length-row {
  display: grid;
  grid-template-columns: 6.5rem minmax(0, 1fr);
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.6rem;
}

.length-row .label {
  color: var(--muted);
  font-size: 0.85rem;
}

.length-row .slider {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.length-row input[type='range'] {
  flex: 1;
  min-width: 0;
}

.reset {
  align-self: flex-start;
  margin-top: 0.6rem;
}
</style>
