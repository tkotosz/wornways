<script setup lang="ts">
// The layouts to arrange the widgets in (`names`: over the replay, or the totals card's), as
// cards with a small drawing of each one's slots on a story frame, its name and what it is.
// Picking one shows its slots as guides on the picture; Arrange puts the widgets in its slots.
import { LAYOUTS, layoutSlots, type LayoutName } from '@wornways/engine';
import { computed } from 'vue';

const props = defineProps<{ layout: LayoutName; names: readonly LayoutName[] }>();
const emit = defineEmits<{ pick: [layout: LayoutName]; arrange: [] }>();

/** Each layout's slots on a story frame, for its drawing. */
const drawings = computed(() =>
  Object.fromEntries(
    props.names.map((name) => [name, layoutSlots(name, { width: 1080, height: 1920 })]),
  ),
);
</script>

<template>
  <div class="layout-picker">
    <div class="cards" role="radiogroup" aria-label="Layout">
      <button
        v-for="name in names"
        :key="name"
        type="button"
        class="card"
        role="radio"
        :aria-checked="layout === name"
        :aria-label="LAYOUTS[name].name"
        @click="emit('pick', name)"
      >
        <svg viewBox="0 0 90 160" aria-hidden="true">
          <rect class="frame" x="0.5" y="0.5" width="89" height="159" rx="5" />
          <rect
            v-for="(slot, k) in drawings[name]"
            :key="k"
            :class="slot.kind"
            :x="((slot.x - slot.width / 2) * 90) / 100"
            :y="((slot.y - slot.height / 2) * 160) / 100"
            :width="(slot.width * 90) / 100"
            :height="(slot.height * 160) / 100"
            rx="1.5"
          />
        </svg>
        <b>{{ LAYOUTS[name].name }}</b>
        <span>{{ LAYOUTS[name].help }}</span>
      </button>
    </div>
    <button type="button" class="primary arrange" @click="emit('arrange')">
      Arrange the widgets in it
    </button>
    <p class="muted hint">
      Its slots show as guides on the picture while you arrange, never in the video; widgets snap to
      them.
    </p>
  </div>
</template>

<style scoped>
.layout-picker {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: 0.6rem;
}

/* A layout: its drawing over its name and what it is; the one in use outlined. */
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.6rem 0.5rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--text);
  background: var(--background);
  font: inherit;
  text-align: center;
}

.card[aria-checked='true'] {
  border-color: var(--accent);
}

.card svg {
  width: 3.4rem;
  height: 6rem;
}

.card b {
  font-size: 0.9rem;
}

.card span {
  color: var(--muted);
  font-size: 0.7rem;
  line-height: 1.3;
}

.frame {
  fill: #0d1626;
  stroke: var(--line);
}

.title {
  fill: rgb(255 255 255 / 55%);
}

.stat {
  fill: rgb(120 200 255 / 60%);
}

.chart {
  fill: rgb(255 138 42 / 60%);
}

.arrange {
  width: 100%;
}

.hint {
  margin: 0;
  font-size: 0.8rem;
}
</style>
