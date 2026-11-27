<script setup lang="ts">
// The source in use, at the top of its page: its drawing, its name and a line about it, with
// Switch source beside them, where it is seen first.
import type { Source } from '../messages.ts';
import { SOURCE_NAMES } from '../sources.ts';
import SourceIcon from './SourceIcon.vue';

defineProps<{
  source: Source;
  /** A line under the name: that it is in use, and how it stands. */
  note: string;
}>();
const emit = defineEmits<{ switch: [] }>();
</script>

<template>
  <div class="source-card" data-testid="source-card">
    <SourceIcon class="logo" :source="source" />
    <div class="who">
      <b>{{ SOURCE_NAMES[source] }}</b>
      <span>{{ note }}</span>
    </div>
    <button type="button" class="secondary switch" @click="emit('switch')">Switch source</button>
  </div>
</template>

<style scoped>
.source-card {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  margin-bottom: 1.1rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--panel);
}

.logo {
  flex: none;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
}

.who {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.who b {
  font-size: 1.05rem;
}

.who span {
  color: var(--muted);
  font-size: 0.82rem;
}

.switch {
  flex: none;
  padding: 0.55rem 0.9rem;
  border-color: var(--accent);
  color: var(--accent);
  white-space: nowrap;
}
</style>
