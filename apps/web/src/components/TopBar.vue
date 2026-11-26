<script setup lang="ts">
// The bar over the editor: at the left, icons that open what is set up around the video (the
// menu, the activities, what the source keeps on this device, the preset); at the right,
// Render. The icons have no captions, to leave room on a phone; each tells screen readers
// what it opens and what is set ("Activities: 12", "Preset: Recap").

defineProps<{
  /** How many activities the video shows; null before any are chosen. */
  activities: number | null;
  /** What the source keeps on this device, when it keeps anything: its button's name. */
  store: string | null;
  /** The preset's name; null before activities are chosen. */
  preset: string | null;
  canRender: boolean;
}>();
const emit = defineEmits<{
  menu: [];
  activities: [];
  store: [];
  preset: [];
  render: [];
}>();
</script>

<template>
  <header class="top-bar" data-testid="top-bar">
    <button type="button" class="icon" aria-label="Menu" @click="emit('menu')">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
    </button>
    <button
      type="button"
      class="icon"
      :aria-label="activities === null ? 'Activities' : `Activities: ${activities}`"
      :disabled="activities === null"
      @click="emit('activities')"
    >
      <!-- A route from a start to a finish. -->
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="6" r="2" />
        <path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" />
      </svg>
      <span v-if="activities !== null" class="badge" aria-hidden="true">{{ activities }}</span>
    </button>
    <button v-if="store" type="button" class="icon" :aria-label="store" @click="emit('store')">
      <!-- A folder with an arrow into it. -->
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="M12 16v-5M9.5 13.5 12 16l2.5-2.5" />
      </svg>
    </button>
    <button
      type="button"
      class="icon"
      :aria-label="preset === null ? 'Preset' : `Preset: ${preset}`"
      :disabled="preset === null"
      @click="emit('preset')"
    >
      <!-- A screen that plays. -->
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M10 9.5v5l4.5-2.5z" />
      </svg>
    </button>
    <span class="space" />
    <button type="button" class="primary render" :disabled="!canRender" @click="emit('render')">
      Render
    </button>
  </header>
</template>

<style scoped>
.top-bar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: calc(0.4rem + env(safe-area-inset-top)) 0.75rem 0.4rem 0.4rem;
  border-bottom: 1px solid var(--line);
  background: var(--background);
}

.icon {
  position: relative;
  display: grid;
  flex: none;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border: 0;
  border-radius: 10px;
  color: var(--text);
  background: none;
}

.icon:not(:disabled):hover {
  background: var(--panel);
}

.icon:disabled {
  opacity: 0.35;
  cursor: default;
}

.icon svg {
  width: 1.5rem;
  height: 1.5rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* How many activities, on the corner of their icon. */
.badge {
  position: absolute;
  top: 0.2rem;
  right: 0;
  min-width: 1.15rem;
  height: 1.15rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  color: #1a110b;
  background: var(--accent);
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.15rem;
  text-align: center;
}

.space {
  flex: 1;
}

.render {
  padding: 0.55rem 1.2rem;
  border-radius: 999px;
  font-size: 0.95rem;
}
</style>
