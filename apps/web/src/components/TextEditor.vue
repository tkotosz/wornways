<script setup lang="ts">
// Writing a text widget's text over the whole screen, as story editors do: the text large in
// the upper part, as it shows on the video, with the keyboard up. A tap anywhere outside the
// text, or the keyboard's Enter, finishes (`done`, with the text as written; an empty text
// is for the widget to be taken away).
import { onMounted, ref } from 'vue';

const props = defineProps<{ text: string }>();
const emit = defineEmits<{ done: [text: string] }>();

const input = ref<HTMLInputElement | null>(null);
const value = ref(props.text);

onMounted(() => input.value?.focus());

function finish(): void {
  emit('done', value.value.trim() ? value.value : '');
}

/**
 * A tap outside the text finishes; on the text it moves the caret as usual. On the tap's
 * click, which ends on the editor itself, not on its first touch: that would close the editor
 * and let the rest of the tap through to what is under it.
 */
function outside(event: MouseEvent): void {
  if (event.target !== input.value) finish();
}
</script>

<template>
  <div class="text-editor" role="dialog" aria-label="Text" @click="outside">
    <input
      ref="input"
      v-model="value"
      type="text"
      aria-label="Text"
      autocomplete="off"
      enterkeyhint="done"
      @keydown.enter.prevent="finish"
      @keydown.escape.prevent="finish"
    />
    <p class="hint" aria-hidden="true">Tap outside the text to finish</p>
  </div>
</template>

<style scoped>
.text-editor {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 28vh 1rem 0;
  background: rgba(0, 0, 0, 0.72);
}

/* The text as it shows on the video: white, bold, with a soft shadow. */
input {
  width: 100%;
  border: 0;
  color: #fff;
  background: none;
  font:
    600 1.9rem / 1.25 Inter,
    system-ui,
    sans-serif;
  text-align: center;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.8);
  outline: none;
}

.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.8rem;
}
</style>
