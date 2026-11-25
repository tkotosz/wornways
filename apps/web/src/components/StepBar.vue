<script setup lang="ts">
// Phones: the bar at the top of the window that moves between the steps: the way back (←) at
// the left, the step's name, Next at the right, and under them a segment per step that shows
// how far along it is. The buttons tell screen readers which step they go to; the first
// step's way back (`backLabel`) leads off the steps, to the list of sources.
// Wide screens have the same buttons at the bottom of the step (StepNav).
import { computed } from 'vue';
import { STEPS, type Step } from '../step-list.ts';

const props = defineProps<{
  step: Step;
  /** Where the way back leads when it is not the step before, e.g. "Sources". */
  backLabel?: string;
  backDisabled?: boolean;
  nextDisabled?: boolean;
}>();
const emit = defineEmits<{ back: []; next: [] }>();

const index = computed(() => STEPS.findIndex((s) => s.id === props.step));
const before = computed(() => props.backLabel ?? STEPS[index.value - 1]?.label);
const after = computed(() => STEPS[index.value + 1]);
</script>

<template>
  <div class="step-bar">
    <div class="row">
      <button
        v-if="before"
        type="button"
        class="back"
        :aria-label="`Back to ${before}`"
        :disabled="backDisabled"
        @click="emit('back')"
      >
        ←
      </button>
      <h2 class="title">
        <span class="visually-hidden">Step {{ index + 1 }} of {{ STEPS.length }}: </span>
        {{ STEPS[index]!.label }}
      </h2>
      <button
        v-if="after"
        type="button"
        class="primary next"
        :aria-label="`Continue to ${after.label}`"
        :disabled="nextDisabled"
        @click="emit('next')"
      >
        Next
      </button>
    </div>
    <!-- How far along: a segment per step, the ones behind filled, the current one bright. -->
    <div class="segments" aria-hidden="true">
      <span
        v-for="(s, i) in STEPS"
        :key="s.id"
        :class="{ done: i < index, current: i === index }"
      />
    </div>
  </div>
</template>

<style scoped>
.step-bar {
  padding: 0.45rem 0.75rem 0.6rem;
}

.row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.25rem;
  margin-bottom: 0.45rem;
}

.back {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  margin-left: -0.4rem;
  padding: 0;
  border: 0;
  color: var(--text);
  background: none;
  font-size: 1.3rem;
  line-height: 1;
}

.back:disabled {
  opacity: 0.4;
}

.title {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 1.05rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Without a way back the title starts where the bar does. */
.title:first-child {
  margin-left: 0.15rem;
}

.next {
  flex: none;
  padding: 0.4rem 1.1rem;
  border-radius: 999px;
  font-size: 0.9rem;
}

/* A column per step, however many there are. */
.segments {
  display: grid;
  grid-auto-columns: 1fr;
  grid-auto-flow: column;
  gap: 0.3rem;
}

.segments span {
  height: 4px;
  border-radius: 99px;
  background: var(--line);
}

.segments .done {
  background: #a45b2e;
}

.segments .current {
  background: var(--accent);
}
</style>
