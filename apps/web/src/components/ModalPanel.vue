<script setup lang="ts">
import { ref, useId } from 'vue';

defineProps<{ title: string }>();

const titleId = useId();
const dialog = ref<HTMLDialogElement | null>(null);
const content = ref<HTMLElement | null>(null);

function open(): void {
  dialog.value?.showModal();
  content.value?.scrollTo({ top: 0 });
}
</script>

<template>
  <slot name="trigger" :open="open" />
  <Teleport to="body">
    <dialog ref="dialog" class="modal" :aria-labelledby="titleId">
      <header class="modal-header">
        <h2 :id="titleId">{{ title }}</h2>
        <button type="button" class="secondary close" autofocus @click="dialog?.close()">
          Close
        </button>
      </header>
      <div ref="content" class="modal-content" tabindex="0">
        <slot />
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.modal {
  width: min(35rem, calc(100% - 2rem));
  max-height: calc(100dvh - 2rem);
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel);
  color: var(--text);
}

.modal[open] {
  display: flex;
  flex-direction: column;
}

.modal::backdrop {
  background: rgb(0 0 0 / 68%);
}

:global(body:has(dialog.modal[open])) {
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--line);
}

.modal-header h2 {
  margin: 0;
  font-size: 1.15rem;
}

.close {
  min-height: 2.5rem;
  padding: 0.45rem 0.75rem;
  font-size: 0.85rem;
}

.modal-content {
  min-height: 0;
  padding: 1rem 1.25rem 1.25rem;
  overflow-y: auto;
  overscroll-behavior: contain;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.55;
}

.modal-content:focus-visible {
  outline-offset: -3px;
}
</style>
