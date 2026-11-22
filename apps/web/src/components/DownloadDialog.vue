<script setup lang="ts">
// How far the download of the chosen activities' tracks is, from Strava or Ride with GPS,
// with a way to cancel it. It opens only when the download takes a moment: when the tracks
// are already here, it is over before the dialog would show. Escape cancels too.
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import type { DownloadProgress } from '../engine-client.ts';

const props = defineProps<{ service: string; progress: DownloadProgress }>();

/** How long a download may take before the dialog opens, in milliseconds. */
const DELAY_MS = 500;

const titleId = useId();
const dialog = ref<HTMLDialogElement | null>(null);
const percent = computed(() =>
  props.progress.total ? Math.floor((props.progress.done / props.progress.total) * 100) : 0,
);

let timer: ReturnType<typeof setTimeout> | undefined;
onMounted(() => (timer = setTimeout(() => dialog.value?.showModal(), DELAY_MS)));
onBeforeUnmount(() => {
  clearTimeout(timer);
  dialog.value?.close();
});

function cancel(event?: Event): void {
  event?.preventDefault();
  props.progress.cancel();
}
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="download"
      :aria-labelledby="titleId"
      data-testid="download"
      @cancel="cancel"
    >
      <h2 :id="titleId">Downloading tracks from {{ service }}</h2>
      <p role="status">
        {{ progress.done }} of {{ progress.total }} {{ progress.total === 1 ? 'track' : 'tracks' }},
        {{ percent }}%
      </p>
      <div
        class="bar"
        role="progressbar"
        :aria-valuenow="percent"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="Download progress"
      >
        <div :style="{ width: `${percent}%` }" />
      </div>
      <p class="muted note">Tracks already downloaded are kept if you cancel.</p>
      <button type="button" class="secondary" autofocus @click="cancel()">Cancel</button>
    </dialog>
  </Teleport>
</template>

<style scoped>
.download {
  width: min(24rem, calc(100% - 2rem));
  padding: 1.25rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel);
  color: var(--text);
}

.download[open] {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.download::backdrop {
  background: rgb(0 0 0 / 68%);
}

h2 {
  margin: 0;
  font-size: 1.1rem;
}

p {
  margin: 0;
}

.note {
  font-size: 0.85rem;
}

.bar {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--line);
  overflow: hidden;
}

.bar div {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
  transition: width 0.2s;
}

button {
  align-self: flex-end;
}
</style>
