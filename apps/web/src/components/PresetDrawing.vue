<script setup lang="ts">
// A small looping drawing of how a preset plays activities: each line is an activity,
// drawn from left to right. Generic, not the person's data.
import type { PresetChoice } from '../adjust.ts';

defineProps<{ preset: PresetChoice }>();

/** One activity: its length (0 to 1) and when it is drawn, as parts of the loop (0 to 1). */
type Line = { length: number; from: number; to: number };

const LINES: Record<PresetChoice, Line[]> = {
  // One after another, each the same time.
  recap: [
    { length: 1, from: 0, to: 0.25 },
    { length: 0.55, from: 0.25, to: 0.5 },
    { length: 0.8, from: 0.5, to: 0.75 },
  ],
  // All start together at the same speed, so the shorter ones finish first.
  'all-at-once': [
    { length: 1, from: 0, to: 0.75 },
    { length: 0.55, from: 0, to: 0.41 },
    { length: 0.35, from: 0, to: 0.26 },
  ],
  // The first day's two activities together, then the next day, which is longer.
  'multiday-trip': [
    { length: 0.6, from: 0, to: 0.3 },
    { length: 0.45, from: 0, to: 0.3 },
    { length: 1, from: 0.3, to: 0.75 },
  ],
  // One activity, drawn over most of the loop.
  highlight: [{ length: 1, from: 0, to: 0.75 }],
  custom: [],
};

/** When the line is hidden, drawing and done, for the animation's keyTimes. */
const keyTimes = (line: Line) => `0;${line.from};${line.to};1`;
</script>

<template>
  <svg class="drawing" viewBox="0 0 100 44" aria-hidden="true">
    <template v-if="preset === 'custom'">
      <!-- Sliders, for settings of one's own. -->
      <g class="sliders">
        <line x1="12" y1="12" x2="88" y2="12" />
        <line x1="12" y1="22" x2="88" y2="22" />
        <line x1="12" y1="32" x2="88" y2="32" />
        <circle cx="34" cy="12" r="3.5" />
        <circle cx="70" cy="22" r="3.5" />
        <circle cx="48" cy="32" r="3.5" />
      </g>
    </template>
    <line
      v-for="(line, i) in LINES[preset]"
      v-else
      :key="i"
      class="activity"
      x1="10"
      :y1="10 + i * 12"
      :x2="10 + 80 * line.length"
      :y2="10 + i * 12"
      pathLength="1"
    >
      <animate
        attributeName="stroke-dashoffset"
        values="1;1;0;0"
        :keyTimes="keyTimes(line)"
        dur="3.2s"
        repeatCount="indefinite"
      />
    </line>
  </svg>
</template>

<style scoped>
.drawing {
  display: block;
  width: 100%;
  height: auto;
}

.activity {
  stroke: var(--accent);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
}

.sliders line {
  stroke: var(--line);
  stroke-width: 2;
  stroke-linecap: round;
}

.sliders circle {
  fill: var(--accent);
}
</style>
