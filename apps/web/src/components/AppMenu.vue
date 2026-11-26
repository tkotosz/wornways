<script setup lang="ts">
// The menu, from the ☰ button: a panel that slides in from the left over the dimmed screen.
// At its top the name and the version; then switching the source (with the one in use),
// installing the app where the browser can, About, and the privacy policy. Back, Escape, a
// tap beside it or picking an item closes it.
import { onMounted, ref } from 'vue';
import type { Source } from '../messages.ts';
import { SOURCE_NAMES } from '../sources.ts';
import SourceIcon from './SourceIcon.vue';

defineProps<{
  version: string;
  source: Source | null;
  /** Whether Install app is offered: by the browser, or as steps on an iPhone or iPad. */
  install: boolean;
}>();
const emit = defineEmits<{ close: []; source: []; about: []; install: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
onMounted(() => dialog.value?.showModal());

function cancel(event: Event): void {
  event.preventDefault();
  emit('close');
}

function tapped(event: MouseEvent): void {
  if (event.target === dialog.value) emit('close');
}
</script>

<template>
  <dialog ref="dialog" class="menu" aria-label="Menu" @cancel="cancel" @click="tapped">
    <div class="panel">
      <div class="brand">
        <img class="mark" src="/icons/route.svg" alt="" />
        <span class="name">
          <span class="wordmark"><b>worn</b>ways</span>
          <span class="version" data-testid="version" :title="version">{{ version }}</span>
        </span>
      </div>

      <nav aria-label="Menu items">
        <button type="button" class="item" @click="emit('source')">
          <SourceIcon v-if="source" class="item-icon" :source="source" />
          <span v-else class="item-icon" />
          <span>
            Switch source
            <small>{{ source ? SOURCE_NAMES[source] : 'None chosen yet' }}</small>
          </span>
        </button>
        <button v-if="install" type="button" class="item" @click="emit('install')">
          <svg class="item-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" />
          </svg>
          <span>Install app</span>
        </button>
        <hr />
        <button type="button" class="item" @click="emit('about')">
          <svg class="item-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v6M12 7.5v.5" />
          </svg>
          <span>About</span>
        </button>
        <a class="item" href="/privacy.html" target="_blank" rel="noopener" @click="emit('close')">
          <svg class="item-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="10" width="14" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <span>Privacy policy</span>
        </a>
      </nav>
    </div>
  </dialog>
</template>

<style scoped>
/* The dialog covers the window; the panel is its left part. */
.menu {
  width: 100%;
  max-width: 100%;
  height: 100%;
  max-height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
}

.menu::backdrop {
  background: rgb(0 0 0 / 55%);
}

.panel {
  box-sizing: border-box;
  width: min(80%, 19rem);
  height: 100%;
  padding: calc(1rem + env(safe-area-inset-top)) 0.6rem 1rem;
  border-right: 1px solid var(--line);
  color: var(--text);
  background: var(--panel);
  box-shadow: 10px 0 30px rgb(0 0 0 / 45%);
  animation: slide-in 0.18s ease-out;
}

@keyframes slide-in {
  from {
    transform: translateX(-100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .panel {
    animation: none;
  }
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 1rem;
  padding: 0.25rem 0.7rem;
}

.mark {
  height: 2.25rem;
}

.name {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

/* The name in the mark's orange gradient, over the whole word. */
.wordmark {
  font-size: 1.35rem;
  font-weight: 300;
  line-height: 1.5rem;
  background: linear-gradient(90deg, #ffab1f, #ff5a1f);
  background-clip: text;
  color: transparent;
}

.wordmark b {
  font-weight: 700;
}

.version {
  overflow: hidden;
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 500;
  line-height: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item {
  display: flex;
  box-sizing: border-box;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  padding: 0.7rem;
  border: 0;
  border-radius: 10px;
  color: var(--text);
  background: none;
  font: inherit;
  text-align: left;
  text-decoration: none;
}

.item:hover,
.item:focus-visible {
  background: rgb(255 255 255 / 6%);
}

.item small {
  display: block;
  color: var(--muted);
  font-size: 0.75rem;
}

.item-icon {
  display: flex;
  flex: none;
  justify-content: center;
  width: 1.6rem;
  height: 1.4rem;
}

svg.item-icon {
  fill: none;
  stroke: var(--muted);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

hr {
  margin: 0.5rem 0.7rem;
  border: 0;
  border-top: 1px solid var(--line);
}
</style>
