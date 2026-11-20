<script setup lang="ts">
import { computed, ref } from 'vue';
import { distanceBound, distanceRange, type Choice } from '../choice.ts';

const bounds = ['minDistanceKm', 'maxDistanceKm'] as const;
type Bound = (typeof bounds)[number];
const names = { minDistanceKm: 'Minimum', maxDistanceKm: 'Maximum' };
const open = { minDistanceKm: -Infinity, maxDistanceKm: Infinity };

const props = defineProps<{
  choice: Choice;
  scale: { min: number; max: number } | null;
}>();
const emit = defineEmits<{ update: [change: Partial<Pick<Choice, Bound>>] }>();
const track = ref<HTMLDivElement | null>(null);

const invalid = computed(() => distanceRange(props.choice) === null);
const values = computed(() => ({
  minDistanceKm: distanceBound(props.choice.minDistanceKm, open.minDistanceKm),
  maxDistanceKm: distanceBound(props.choice.maxDistanceKm, open.maxDistanceKm),
}));

const positions = computed(() => {
  if (!props.scale) return { minDistanceKm: 0, maxDistanceKm: 0 };
  const { min, max } = props.scale;
  if (invalid.value) return { minDistanceKm: min, maxDistanceKm: max };
  const project = (value: number) => Math.round(Math.max(min, Math.min(max, value)) * 10) / 10;
  return {
    minDistanceKm: project(values.value.minDistanceKm),
    maxDistanceKm: project(values.value.maxDistanceKm),
  };
});

function percent(km: number): number {
  const { min, max } = props.scale!;
  return ((km - min) / (max - min)) * 100;
}

function move(bound: Bound, km: number): number {
  const { min, max } = props.scale!;
  const lower = bound === 'minDistanceKm';
  const other = values.value[lower ? 'maxDistanceKm' : 'minDistanceKm'];
  const limited = Number.isNaN(other) ? km : lower ? Math.min(km, other) : Math.max(km, other);
  const value = Math.max(min, Math.min(max, limited));
  emit('update', { [bound]: value === (lower ? min : max) ? '' : String(value) });
  return value;
}

function slide(bound: Bound, event: Event): void {
  const input = event.target as HTMLInputElement;
  input.value = String(move(bound, input.valueAsNumber));
}

function tap(event: MouseEvent): void {
  if (!track.value || !props.scale) return;
  const { left, width } = track.value.getBoundingClientRect();
  const { min, max } = props.scale;
  const ratio = Math.max(0, Math.min(1, (event.clientX - left) / width));
  const km = Math.round((min + ratio * (max - min)) * 10) / 10;
  const midpoint = (positions.value.minDistanceKm + positions.value.maxDistanceKm) / 2;
  move(km < midpoint ? 'minDistanceKm' : 'maxDistanceKm', km);
}
</script>

<template>
  <div class="distance" role="group" aria-labelledby="distance-label">
    <template v-if="scale">
      <div class="range" @click.self="tap">
        <div ref="track" class="track" aria-hidden="true">
          <div
            v-if="!invalid"
            class="span"
            :style="{
              left: `${percent(positions.minDistanceKm)}%`,
              right: `${100 - percent(positions.maxDistanceKm)}%`,
            }"
          />
        </div>
        <input
          v-for="bound in bounds"
          :key="bound"
          type="range"
          :min="scale.min"
          :max="scale.max"
          step="0.1"
          :value="positions[bound]"
          :aria-label="`${names[bound]} distance`"
          :aria-valuemin="bound === 'maxDistanceKm' ? positions.minDistanceKm : undefined"
          :aria-valuemax="bound === 'minDistanceKm' ? positions.maxDistanceKm : undefined"
          :aria-valuetext="Number.isFinite(values[bound]) ? `${values[bound]} km` : 'Any'"
          @input="slide(bound, $event)"
        />
      </div>
      <div class="scale" aria-hidden="true">
        <span>{{ scale.min }} km</span>
        <span>{{ scale.max }} km</span>
      </div>
    </template>
    <div class="fields">
      <label v-for="bound in bounds" :key="bound">
        {{ names[bound] }} (km)
        <input
          type="text"
          inputmode="decimal"
          placeholder="Any"
          :value="choice[bound]"
          :aria-invalid="invalid || undefined"
          :aria-describedby="invalid ? 'distance-error' : undefined"
          @input="emit('update', { [bound]: ($event.target as HTMLInputElement).value })"
        />
      </label>
    </div>
    <p v-if="invalid" id="distance-error" class="error" role="alert">
      Enter distances of 0 km or more. The minimum must be at or below the maximum.
    </p>
  </div>
</template>

<style scoped>
.distance {
  --thumb-size: 1.75rem;
  max-width: 32rem;
}

.range {
  position: relative;
  height: var(--thumb-size);
}

.track {
  position: absolute;
  inset: calc(50% - 2px) calc(var(--thumb-size) / 2) auto;
  height: 4px;
  border-radius: 999px;
  background: var(--line);
  pointer-events: none;
}

.span {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: inherit;
  background: var(--accent);
}

/* Both native inputs share a rail. Only their thumbs take pointer events. */
.range input {
  appearance: none;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  background: transparent;
  pointer-events: none;
}

.range input:focus-visible {
  z-index: 1;
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 6px;
}

.range input::-webkit-slider-thumb {
  appearance: none;
  width: var(--thumb-size);
  height: var(--thumb-size);
  border: calc((var(--thumb-size) - 1.125rem) / 2) solid transparent;
  border-radius: 50%;
  background: var(--accent) padding-box;
  cursor: grab;
  pointer-events: auto;
}

.range input::-moz-range-thumb {
  box-sizing: border-box;
  width: var(--thumb-size);
  height: var(--thumb-size);
  border: calc((var(--thumb-size) - 1.125rem) / 2) solid transparent;
  border-radius: 50%;
  background: var(--accent) padding-box;
  cursor: grab;
  pointer-events: auto;
}

.scale {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.65rem;
  padding-inline: calc(var(--thumb-size) / 2);
  color: var(--muted);
  font-size: 0.75rem;
}

.fields {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.fields label {
  display: grid;
  gap: 0.3rem;
  color: var(--muted);
  font-size: 0.85rem;
}

.fields input {
  width: 8rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.4rem 0.8rem;
  color: var(--text);
  background: var(--panel);
  font: inherit;
  font-size: 1rem;
}

.fields input[aria-invalid='true'] {
  border-color: var(--danger);
}

.error {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
}

@media (pointer: coarse) {
  .distance {
    --thumb-size: 2.75rem;
  }
}
</style>
