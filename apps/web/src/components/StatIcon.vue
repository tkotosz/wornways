<script setup lang="ts">
// A stat's icon as the engine draws it in front of the value (see the engine's icons.ts), as
// SVG in the text's color: its parts filled or stroked on a 24 by 24 grid.
import { ICONS, iconOf, type Metric } from '@wornways/engine';
import { computed } from 'vue';

const props = defineProps<{ metric: Metric }>();
const parts = computed(() => ICONS[iconOf(props.metric)]);
</script>

<template>
  <svg class="stat-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path
      v-for="(part, index) in parts"
      :key="index"
      :d="part.d"
      :fill="part.fill ? 'currentColor' : 'none'"
      :stroke="part.fill ? 'none' : 'currentColor'"
      :stroke-width="part.width ?? 2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<style scoped>
/* As the engine sets it: 0.8 of the text's size and 0.22 after it, centered on the figures. */
.stat-icon {
  display: inline-block;
  width: 0.8em;
  height: 0.8em;
  margin-right: 0.22em;
  vertical-align: -0.04em;
}
</style>
