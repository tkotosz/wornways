<script setup lang="ts">
// Moving between the steps, the same way on every step. The buttons name the step they go
// to ("← Source", "Design →") and always change the step.
// Wide screens: a bar at the bottom of the step, which stays at the bottom of the window
// while the step is taller than it, with the step's own actions (the slot) between.
// Phones: the step bar at the top of the window, drawn into the app's top bar (#step-nav);
// the bottom bar then holds only the step's own actions, while there are some (`actions`).
import { computed } from 'vue';
import { STEPS, type Step } from '../step-list.ts';
import StepBar from './StepBar.vue';

const props = defineProps<{
  step: Step;
  /** Where the way back leads when it is not the step before, e.g. "Sources". */
  backLabel?: string;
  backDisabled?: boolean;
  nextDisabled?: boolean;
  /** Whether the slot holds actions now, so phones show the bottom bar for them. */
  actions?: boolean;
}>();
const emit = defineEmits<{ back: []; next: [] }>();

const index = computed(() => STEPS.findIndex((s) => s.id === props.step));
const before = computed(() => props.backLabel ?? STEPS[index.value - 1]?.label);
const after = computed(() => STEPS[index.value + 1]);
</script>

<template>
  <Teleport defer to="#step-nav">
    <StepBar
      :step="step"
      :back-label="backLabel"
      :back-disabled="backDisabled"
      :next-disabled="nextDisabled"
      @back="emit('back')"
      @next="emit('next')"
    />
  </Teleport>
  <div :class="['footer', 'step-footer', { actions }]">
    <button
      v-if="before"
      type="button"
      class="secondary step-button"
      :aria-label="`Back to ${before}`"
      :disabled="backDisabled"
      @click="emit('back')"
    >
      ← {{ before }}
    </button>
    <span v-else class="step-button" />
    <slot />
    <button
      v-if="after"
      type="button"
      class="primary step-button"
      :aria-label="`Continue to ${after.label}`"
      :disabled="nextDisabled"
      @click="emit('next')"
    >
      {{ after.label }} →
    </button>
  </div>
</template>

<style scoped>
/* The way back at the left, on at the right, and the step's own actions between. Equal outer
   columns keep the middle at the bar's center whatever the buttons' widths. */
.step-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 0.8rem;
}

.step-footer > *,
.step-footer > :slotted(*) {
  white-space: nowrap;
}

.step-footer > :first-child {
  justify-self: start;
}

.step-footer > .primary.step-button {
  grid-column: 3;
  justify-self: end;
}

/* Phones: the bottom bar holds only the step's own actions, sharing its width, and only
   when it has some. */
@media (max-width: 760px) {
  .step-footer {
    display: flex;
    align-items: stretch;
  }

  /* The actions come from the step (the slot), so they are styled as slotted. */
  .step-footer > :slotted(*) {
    box-sizing: border-box;
    flex: 1 1 0;
    /* The same padding, so the buttons come out the same width (flex counts it apart). */
    padding-inline: 1rem;
    text-align: center;
  }

  /* A border like the secondary buttons' one, for the same reason. */
  .step-footer > :slotted(.primary) {
    border: 1px solid transparent;
  }

  .step-footer .step-button {
    display: none;
  }

  .step-footer:not(.actions) {
    display: none;
  }
}
</style>
