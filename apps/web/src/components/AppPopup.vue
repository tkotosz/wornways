<script setup lang="ts">
// A popup over the editor: the whole screen on phones, a panel in the middle on wide screens.
// It has a title, its content, which scrolls, and a footer for its buttons. A popup that can
// close has ✕ (and Escape, and a tap beside the panel); one that cannot yet, because there is
// nothing behind it, has the menu's button instead, so About and the rest stay in reach.
import { onMounted, ref, useId } from 'vue';

const props = withDefaults(
  defineProps<{
    title: string;
    closable: boolean;
    /** A narrow panel on wide screens, for a few lines of text. */
    narrow?: boolean;
  }>(),
  { narrow: false },
);
const emit = defineEmits<{ close: []; menu: [] }>();

const titleId = useId();
const dialog = ref<HTMLDialogElement | null>(null);
const content = ref<HTMLElement | null>(null);

onMounted(() => dialog.value?.showModal());

/** Escape closes it, when it can close. */
function cancel(event: Event): void {
  event.preventDefault();
  if (props.closable) emit('close');
}

/** A tap beside the panel lands on the dialog itself (wide screens). */
function tapped(event: MouseEvent): void {
  if (event.target === dialog.value && props.closable) emit('close');
}

defineExpose({ content });
</script>

<template>
  <dialog
    ref="dialog"
    class="popup"
    :class="{ narrow }"
    :aria-labelledby="titleId"
    @cancel="cancel"
    @click="tapped"
  >
    <header class="head">
      <button
        v-if="!closable"
        type="button"
        class="icon-button"
        aria-label="Menu"
        @click="emit('menu')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      <h2 :id="titleId" tabindex="-1" autofocus>{{ title }}</h2>
      <button
        v-if="closable"
        type="button"
        class="icon-button"
        aria-label="Close"
        @click="emit('close')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </header>
    <div ref="content" class="body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="foot">
      <slot name="footer" />
    </footer>
  </dialog>
</template>

<style scoped>
/* Phones: the whole screen. */
.popup {
  width: 100%;
  max-width: 100%;
  height: 100%;
  max-height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  color: var(--text);
  background: var(--background);
}

.popup[open] {
  display: flex;
  flex-direction: column;
}

.popup::backdrop {
  background: rgb(0 0 0 / 60%);
}

/* Wide screens: a panel in the middle of the window, over the dimmed editor. */
@media (min-width: 761px) {
  .popup {
    width: min(58rem, calc(100% - 3rem));
    height: auto;
    max-height: calc(100dvh - 3rem);
    margin: auto;
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgb(0 0 0 / 50%);
  }

  .popup.narrow {
    width: min(34rem, calc(100% - 3rem));
  }
}

.head {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.5rem;
  padding: calc(0.5rem + env(safe-area-inset-top)) 0.75rem 0.5rem 1.25rem;
  border-bottom: 1px solid var(--line);
}

/* The menu's button comes first, at the left edge. */
.head .icon-button:first-child {
  margin-left: -0.6rem;
}

/* The title takes the focus when it opens, so no button shows a focus ring at first. */
.head h2 {
  outline: none;
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 1.1rem;
}

.icon-button {
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

.icon-button:hover {
  background: var(--panel);
}

.icon-button svg {
  width: 1.4rem;
  height: 1.4rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}

.body {
  flex: 1;
  min-height: 0;
  padding: 1.1rem 1.25rem 1.25rem;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.foot {
  display: flex;
  flex: none;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 0.75rem 1.25rem calc(0.75rem + env(safe-area-inset-bottom));
  border-top: 1px solid var(--line);
}

/* Phones: the footer's buttons share its width, each as wide as the others: the same padding
   and a border on every one (flex sizes them apart from these). */
@media (max-width: 760px) {
  .foot > :slotted(*) {
    box-sizing: border-box;
    flex: 1 1 0;
    padding-inline: 1rem;
    text-align: center;
  }

  .foot > :slotted(.primary) {
    border: 1px solid transparent;
  }
}
</style>
