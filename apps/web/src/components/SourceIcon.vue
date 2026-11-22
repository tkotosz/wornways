<script setup lang="ts">
// A small drawing of an activity source, in the style of the playback presets' drawings:
// an outline with an orange route. Ride with GPS asks integrations to use its official
// icon (public/ridewithgps-icon.svg, unchanged); Strava's brand rules allow only its connect
// button and "Powered by" badges, so Strava gets a drawing.
import type { Source } from '../messages.ts';

defineProps<{ source: Source }>();

/**
 * Each drawing's area, cropped to its own shape (with room for the stroke), so every icon
 * is as tall as the box the page gives it and starts at its left edge.
 */
const VIEW_BOX: Record<Exclude<Source, 'rwgps'>, string> = {
  files: '36.5 2.5 29 39',
  strava: '27 0 46 42',
  demo: '31.5 3.5 37 37',
};
</script>

<template>
  <span class="source-icon" aria-hidden="true">
    <img v-if="source === 'rwgps'" src="/ridewithgps-icon.svg" alt="" />
    <svg v-else :viewBox="VIEW_BOX[source]">
      <!-- Files: a sheet with a route on it. -->
      <template v-if="source === 'files'">
        <path class="outline" d="M38 4 h18 l8 8 v28 h-26 z" />
        <path class="outline" d="M56 4 v8 h8" />
        <path class="route" d="M43 34 q4 -10 9 -6 t8 -10" />
      </template>
      <!-- Strava: a route coming down from the cloud. -->
      <template v-else-if="source === 'strava'">
        <path
          class="outline"
          d="M34 26 a8 8 0 0 1 2 -15.6 a11 11 0 0 1 21 -2.4 a9 9 0 0 1 9 18 z"
        />
        <path class="route" d="M50 30 v10 M45 35 l5 5 l5 -5" />
      </template>
      <!-- Demo: play. -->
      <template v-else>
        <circle class="outline" cx="50" cy="22" r="17" />
        <path class="play" d="M45 14 l13 8 l-13 8 z" />
      </template>
    </svg>
  </span>
</template>

<style scoped>
/* The page sets the box's height (and width, to centre it in a row); the icon fills the
   height and keeps its shape. */
.source-icon {
  display: flex;
  align-items: center;
}

.source-icon svg,
.source-icon img {
  display: block;
  height: 100%;
  width: auto;
  overflow: visible;
}

/* The official icon is solid and wider than the drawings: a little smaller, it weighs the
   same. Its shape is kept, as Ride with GPS's guidelines ask. */
.source-icon img {
  height: 82%;
}

.outline {
  fill: none;
  stroke: var(--muted);
  stroke-width: 2.5;
  stroke-linejoin: round;
}

.route {
  fill: none;
  stroke: var(--accent);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.dot,
.play {
  fill: var(--accent);
}
</style>
