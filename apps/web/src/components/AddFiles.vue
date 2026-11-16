<script setup lang="ts">
// Adding activity files, folders or an export archive, and what the last import did.
import { ref } from 'vue';
import type { EngineClient } from '../engine-client.ts';
import { countText } from '../format.ts';
import type { ActivitySummary, ImportReport, Progress } from '../messages.ts';

const props = defineProps<{ engine: EngineClient }>();
const emit = defineEmits<{ changed: [library: ActivitySummary[]] }>();

const fileInput = ref<HTMLInputElement | null>(null);
const folderInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);
const progress = ref<Progress | null>(null);
const report = ref<ImportReport | null>(null);
const error = ref('');

async function add(files: File[]): Promise<void> {
  if (files.length === 0) return;
  progress.value = { stage: 'reading' };
  error.value = '';
  try {
    const added = await props.engine.addFiles(files, (p) => (progress.value = p));
    report.value = added.report;
    emit('changed', added.activities);
    // Ask the browser to keep the library instead of clearing it when space runs low.
    if (added.report.added > 0) void navigator.storage?.persist?.();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    progress.value = null;
  }
}

function picked(event: Event): void {
  const target = event.target as HTMLInputElement;
  void add([...(target.files ?? [])]);
  target.value = '';
}

function dropped(event: DragEvent): void {
  dragging.value = false;
  void add([...(event.dataTransfer?.files ?? [])]);
}

function progressText(p: Progress): string {
  if (p.stage === 'storing') return 'Saving on this device…';
  if (p.total) return `Reading activity ${(p.done ?? 0) + 1} of ${p.total}…`;
  return 'Reading files…';
}
</script>

<template>
  <div
    class="drop"
    :class="{ dragging }"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="dropped"
  >
    <template v-if="progress">
      <strong>{{ progressText(progress) }}</strong>
    </template>
    <template v-else>
      <strong>Drop files or an export ZIP here</strong>
      <span class="buttons">
        <button type="button" class="secondary" @click="fileInput?.click()">Choose files</button>
        <button type="button" class="secondary" @click="folderInput?.click()">
          Choose a folder
        </button>
      </span>
    </template>
  </div>
  <input
    ref="fileInput"
    type="file"
    multiple
    accept=".fit,.gpx,.tcx,.gz,.zip,.csv"
    hidden
    data-testid="file-input"
    @change="picked"
  />
  <input
    ref="folderInput"
    type="file"
    webkitdirectory
    hidden
    data-testid="folder-input"
    @change="picked"
  />

  <p v-if="error" class="error" role="alert">{{ error }}</p>

  <div v-if="report" class="report" data-testid="import-report">
    <button
      type="button"
      class="link close"
      aria-label="Close the import report"
      @click="report = null"
    >
      ✕
    </button>
    <p>
      {{ countText(report.added, 'activity', 'activities') }} added<template
        v-if="report.alreadyThere"
        >, {{ report.alreadyThere }} already there</template
      >.<template v-if="report.renamed">
        {{ countText(report.renamed, 'activity was', 'activities were') }} renamed from the export's
        activity list.</template
      >
    </p>
    <details v-if="report.withoutGps.length" class="muted">
      <summary>
        {{ countText(report.withoutGps.length, 'activity has', 'activities have') }} no GPS route,
        such as indoor workouts, and {{ report.withoutGps.length === 1 ? 'was' : 'were' }} left out.
      </summary>
      {{ report.withoutGps.join(', ') }}
    </details>
    <div v-if="report.unreadable.length">
      <p class="error">
        {{ countText(report.unreadable.length, 'file', 'files') }} could not be read:
      </p>
      <ul class="muted">
        <li v-for="u in report.unreadable" :key="u.file">{{ u.file }}: {{ u.reason }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.9rem;
  margin: 1.5rem 0 1rem;
  padding: 2rem 1rem;
  border: 2px dashed var(--line);
  border-radius: 16px;
  background: var(--panel);
  text-align: center;
}

.drop.dragging {
  border-color: var(--accent);
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.6rem;
}

.report {
  position: relative;
  margin-bottom: 1rem;
  padding: 0.5rem 2.5rem 0.8rem 1rem;
  border-radius: 12px;
  background: var(--panel);
}

.close {
  position: absolute;
  top: 0.7rem;
  right: 0.9rem;
  text-decoration: none;
}
</style>
