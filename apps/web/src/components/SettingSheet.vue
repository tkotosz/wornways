<script setup lang="ts">
// One setting on its own. Phones: a sheet that comes up from the bottom of the screen, over
// the settings list; the top of the picture stays in view, and changes show on it as they
// are made. Done, Escape or a tap outside closes it. Wide screens (`docked`): a panel in the
// place of the section's settings, at the right under the top bar, that leaves the picture
// free to work on; Done or Escape closes it.
import { onMounted, ref, useId } from 'vue';

const props = defineProps<{ title: string; docked?: boolean }>();
const emit = defineEmits<{ close: [] }>();

const titleId = useId();
const dialog = ref<HTMLDialogElement | null>(null);

onMounted(() => {
  if (!props.docked) return dialog.value?.showModal();
  // Docked, it leaves the focus where it was: on the picked widget, or the text being written.
  const focused = document.activeElement;
  dialog.value?.show();
  if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
});

/** A tap on the backdrop lands on the dialog itself, outside the sheet's content. */
function tapped(event: MouseEvent): void {
  if (event.target === dialog.value) dialog.value?.close();
}
</script>

<template>
  <dialog
    ref="dialog"
    class="sheet"
    :class="{ docked }"
    :aria-labelledby="titleId"
    @close="emit('close')"
    @click="tapped"
    @keydown.esc="dialog?.close()"
  >
    <div class="content">
      <header class="head">
        <h2 :id="titleId">{{ title }}</h2>
        <button type="button" class="done" @click="dialog?.close()">Done</button>
      </header>
      <slot />
    </div>
  </dialog>
</template>

<style scoped>
.sheet {
  width: 100%;
  max-width: 100%;
  max-height: 70dvh;
  margin: auto 0 0;
  padding: 0;
  border: 0;
  border-top: 1px solid var(--line);
  border-radius: 16px 16px 0 0;
  color: var(--text);
  background: var(--panel);
  box-shadow: 0 -10px 30px rgb(0 0 0 / 50%);
}

/* Docked: the height of the window under the top bar, over the section's settings. */
.sheet.docked {
  position: fixed;
  inset: var(--top-bar-height, 0px) 0 0 auto;
  z-index: 5;
  width: var(--inspector-width);
  height: auto;
  max-height: none;
  margin: 0;
  border: 0;
  border-left: 1px solid var(--line);
  border-radius: 0;
  box-shadow: none;
  overflow-y: auto;
}

.sheet::backdrop {
  background: rgb(0 0 0 / 35%);
}

.content {
  padding: 0.4rem 1rem calc(1.2rem + env(safe-area-inset-bottom));
}

.head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 -1rem 0.6rem;
  padding: 0.6rem 1rem;
  background: var(--panel);
}

.head h2 {
  margin: 0;
  font-size: 1.05rem;
}

.done {
  padding: 0.3rem 0;
  border: 0;
  color: var(--accent);
  background: none;
  font: inherit;
  font-weight: 700;
}
</style>
