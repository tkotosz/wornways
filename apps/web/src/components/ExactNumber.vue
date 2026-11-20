<script setup lang="ts">
const props = defineProps<{
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
}>();
const emit = defineEmits<{ change: [value: number] }>();

function commit(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (input.validity.valid && Number.isFinite(input.valueAsNumber))
    emit('change', input.valueAsNumber);
  else input.value = String(props.value);
}

function apply(event: KeyboardEvent): void {
  const input = event.target as HTMLInputElement;
  if (input.reportValidity()) input.blur();
}
</script>

<template>
  <span class="exact-number">
    <input
      type="number"
      inputmode="decimal"
      step="any"
      required
      :aria-label="label"
      :min="min"
      :max="max"
      :value="value"
      @change.stop="commit"
      @keydown.enter.prevent="apply"
    />
    <span aria-hidden="true">{{ unit }}</span>
  </span>
</template>

<style scoped>
.exact-number {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.25rem;
  white-space: nowrap;
}

input {
  width: 5rem;
  min-width: 0;
  padding: 0.25rem 0.4rem;
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--text);
  background: var(--background);
  font: inherit;
}
</style>
