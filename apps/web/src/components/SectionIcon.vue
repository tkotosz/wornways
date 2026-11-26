<script setup lang="ts">
// A section's line drawing, in the section bar: a phone's frame, play, a folded map, text on
// a picture, a finish flag.
import type { Section } from '../adjust.ts';

defineProps<{ section: Section }>();
</script>

<template>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <template v-if="section === 'frame'">
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M3 8v8M21 8v8" />
    </template>
    <template v-else-if="section === 'playback'">
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l6-3.5z" />
    </template>
    <template v-else-if="section === 'map'">
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </template>
    <template v-else-if="section === 'overlay'">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8h7M7 16h4" />
    </template>
    <path v-else d="M5 21V4h11l-2 4 2 4H5" />
  </svg>
</template>

<style scoped>
svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
