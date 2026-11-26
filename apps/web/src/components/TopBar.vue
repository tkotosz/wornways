<script setup lang="ts">
// The bar over the editor: at the left, icons that open what is set up around the video (the
// menu, the activities, what the source keeps on this device, the preset); at the right,
// Render. Each icon has a short caption under it, the same whatever is set, so the bar keeps
// its width; it tells screen readers what it opens and what is set ("Activities: 12",
// "Preset: Recap"). Wide screens: the name first, each caption beside its icon, the preset's
// name after its caption and the activities' count after theirs, all lined up with the
// editor under the bar (no wider than it).

defineProps<{
  /** How many activities the video shows; null before any are chosen. */
  activities: number | null;
  /** What the source keeps on this device, when it keeps anything: its name and caption. */
  store: { label: string; caption: string } | null;
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
    <div class="in">
      <span class="brand" aria-hidden="true">
        <img src="/icons/route.svg" alt="" />
        <span class="wordmark"><b>worn</b>ways</span>
      </span>
      <button type="button" class="icon" aria-label="Menu" @click="emit('menu')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        <span class="caption" aria-hidden="true">Menu</span>
      </button>
      <button
        type="button"
        class="icon"
        :aria-label="activities === null ? 'Activities' : `Activities: ${activities}`"
        :disabled="activities === null"
        @click="emit('activities')"
      >
        <span class="glyph">
          <!-- A route from a start to a finish. -->
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="6" cy="18" r="2" />
            <circle cx="18" cy="6" r="2" />
            <path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" />
          </svg>
          <span v-if="activities !== null" class="badge" aria-hidden="true">{{ activities }}</span>
        </span>
        <span class="caption" aria-hidden="true">Activities</span>
      </button>
      <button
        v-if="store"
        type="button"
        class="icon"
        :aria-label="store.label"
        @click="emit('store')"
      >
        <!-- A folder with an arrow into it. -->
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="M12 16v-5M9.5 13.5 12 16l2.5-2.5" />
        </svg>
        <span class="caption" aria-hidden="true">{{ store.caption }}</span>
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
        <span class="caption" aria-hidden="true">Preset</span>
        <span v-if="preset !== null" class="value" aria-hidden="true">{{ preset }}</span>
      </button>
      <span class="space" />
      <button type="button" class="primary render" :disabled="!canRender" @click="emit('render')">
        Render
      </button>
    </div>
  </header>
</template>

<style scoped>
.top-bar {
  padding: calc(0.3rem + env(safe-area-inset-top)) 0.75rem 0.3rem 0.3rem;
  border-bottom: 1px solid var(--line);
  background: var(--background);
}

.in {
  display: flex;
  align-items: center;
  gap: 0.1rem;
}

/* The name, and the preset's name, on wide screens only. */
.brand,
.value {
  display: none;
}

/* The icon over its caption. */
.icon {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  min-width: 3.4rem;
  padding: 0.3rem 0.35rem 0.25rem;
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

.caption {
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

/* How many activities, on the corner of their icon. */
.glyph {
  position: relative;
  display: flex;
}

.badge {
  position: absolute;
  top: -0.35rem;
  right: -0.8rem;
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

/* Wide screens: as wide as the editor under the bar, its edges over the editor's; the name
   in the mark's orange first; each caption beside its icon, with what is set after it. */
@media (min-width: 761px) {
  .top-bar {
    padding: 0.55rem 0;
  }

  .in {
    gap: 0.3rem;
    box-sizing: border-box;
    max-width: var(--studio-width);
    margin-inline: auto;
    padding-inline: 1rem;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    margin-right: 0.9rem;
    padding-right: 1.2rem;
    border-right: 1px solid var(--line);
  }

  .brand img {
    height: 1.1rem;
  }

  .wordmark {
    font-size: 1.25rem;
    font-weight: 300;
    line-height: 1;
    background: linear-gradient(90deg, #ffab1f, #ff5a1f);
    background-clip: text;
    color: transparent;
  }

  .wordmark b {
    font-weight: 700;
  }

  .icon {
    flex-direction: row;
    gap: 0.5rem;
    min-width: 0;
    padding: 0.45rem 0.75rem;
  }

  .icon svg {
    width: 1.35rem;
    height: 1.35rem;
  }

  .caption {
    color: var(--text);
    font-size: 0.9rem;
  }

  .value {
    display: inline;
    color: var(--muted);
    font-size: 0.9rem;
    white-space: nowrap;
  }

  /* The count after the caption, not on the icon's corner. */
  .glyph {
    display: contents;
  }

  .glyph + .caption {
    order: 1;
  }

  .badge {
    position: static;
    order: 2;
  }

  .render {
    padding: 0.6rem 1.5rem;
  }
}
</style>
