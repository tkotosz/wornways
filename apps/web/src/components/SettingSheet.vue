<script setup lang="ts">
// One setting on its own. Phones: a sheet that comes up from the bottom of the screen, over
// the settings list; the top of the picture stays in view, and changes show on it as they
// are made. Wide screens: a dialog. Done, Escape or a tap outside closes it.
import { onMounted, ref, useId } from 'vue';

defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();

const titleId = useId();
const dialog = ref<HTMLDialogElement | null>(null);

onMounted(() => dialog.value?.showModal());

/** A tap on the backdrop lands on the dialog itself, outside the sheet's content. */
function tapped(event: MouseEvent): void {
  if (event.target === dialog.value) dialog.value?.close();
}
</script>

<template>
  <dialog
    ref="dialog"
    class="sheet"
    :aria-labelledby="titleId"
    @close="emit('close')"
    @click="tapped"
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

/* Wide screens: a dialog in the middle of the window. */
@media (min-width: 761px) {
  .sheet {
    width: min(32rem, calc(100% - 2rem));
    margin: auto;
    border: 1px solid var(--line);
    border-radius: 16px;
  }
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
