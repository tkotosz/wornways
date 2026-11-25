<script setup lang="ts">
// Phones: the bar at the top of the window that moves between the steps: the way back at the
// left, which step of how many in the middle, on at the right. The buttons name the step they
// go to. Wide screens have the same buttons at the bottom of the step (StepNav).
import { computed } from 'vue';
import { STEPS, type Step } from '../step-list.ts';

const props = defineProps<{ step: Step; backDisabled?: boolean; nextDisabled?: boolean }>();
const emit = defineEmits<{ back: []; next: [] }>();

const index = computed(() => STEPS.findIndex((s) => s.id === props.step));
const before = computed(() => STEPS[index.value - 1]);
const after = computed(() => STEPS[index.value + 1]);
</script>

<template>
  <div class="step-bar">
    <button v-if="before" type="button" class="back" :disabled="backDisabled" @click="emit('back')">
      ← <span class="visually-hidden">Back to </span>{{ before.label }}
    </button>
    <span v-else />
    <span class="where">
      Step {{ index + 1 }} of {{ STEPS.length }} · <b>{{ STEPS[index]!.label }}</b>
    </span>
    <button
      v-if="after"
      type="button"
      class="primary next"
      :disabled="nextDisabled"
      @click="emit('next')"
    >
      <span class="visually-hidden">Continue to </span>{{ after.label }} →
    </button>
    <span v-else />
  </div>
</template>

<style scoped>
/* Equal outer columns, so the middle stays centered whatever the buttons' widths. */
.step-bar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
}

.back {
  justify-self: start;
  padding: 0.4rem 0.25rem;
  border: 0;
  color: var(--muted);
  background: none;
  font: inherit;
  white-space: nowrap;
}

.back:disabled {
  opacity: 0.4;
}

.where {
  overflow: hidden;
  color: var(--muted);
  font-size: 0.8rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.where b {
  color: var(--text);
  font-weight: 600;
}

.next {
  justify-self: end;
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  font-size: 0.9rem;
  white-space: nowrap;
}
</style>
