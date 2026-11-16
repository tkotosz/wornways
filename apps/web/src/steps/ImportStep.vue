<script setup lang="ts">
// Step 1: add activity files, folders or an export archive; see and delete what is stored.
import { ref } from 'vue';
import ActivityGrid from '../components/ActivityGrid.vue';
import AddFiles from '../components/AddFiles.vue';
import GettingFiles from '../components/GettingFiles.vue';
import type { EngineClient } from '../engine-client.ts';
import { countText } from '../format.ts';
import type { ActivitySummary } from '../messages.ts';

const props = defineProps<{ engine: EngineClient; library: ActivitySummary[] }>();
const emit = defineEmits<{ changed: [library: ActivitySummary[]]; next: [] }>();

const error = ref('');
const confirmingDeleteAll = ref(false);

async function remove(ids: string[] | 'all'): Promise<void> {
  error.value = '';
  try {
    emit('changed', await props.engine.deleteActivities(ids));
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    confirmingDeleteAll.value = false;
  }
}
</script>

<template>
  <section>
    <h1>Import your activities</h1>
    <!-- What the app is for, while there is nothing in it yet. -->
    <p v-if="library.length === 0" class="intro" data-testid="intro">
      Wornways turns your GPS activities into a short video: your routes build up over a street map,
      one after another or all at once, ready to share. Everything happens on this device; your
      files are never uploaded.
    </p>
    <p class="muted">
      Add the GPS files of your rides, runs and hikes: FIT, GPX or TCX files, a folder of them, or
      the ZIP file of your Strava account export as it is. They are read here in your browser and
      kept on this device for your next visit.
    </p>

    <AddFiles :engine="engine" @changed="emit('changed', $event)" />
    <GettingFiles :open="library.length === 0" />
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <template v-if="library.length">
      <div class="library-head">
        <h2 data-testid="activity-count">
          {{ countText(library.length, 'activity', 'activities') }} on this device
        </h2>
        <span v-if="confirmingDeleteAll" class="confirm">
          Delete all of them?
          <button type="button" class="danger" @click="remove('all')">Delete all</button>
          <button type="button" class="link" @click="confirmingDeleteAll = false">Keep them</button>
        </span>
        <button v-else type="button" class="link" @click="confirmingDeleteAll = true">
          Delete all my data
        </button>
      </div>
      <ActivityGrid :rows="library" mode="delete" test-id="library" @delete="remove([$event])" />
    </template>

    <div class="footer">
      <span />
      <button type="button" class="primary" :disabled="library.length === 0" @click="emit('next')">
        Continue →
      </button>
    </div>
  </section>
</template>

<style scoped>
.intro {
  margin: 0 0 0.8rem;
  font-size: 1.05rem;
  line-height: 1.5;
}

.library-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  margin: 1.5rem 0 0.8rem;
}

.library-head h2 {
  margin: 0;
  font-size: 1.05rem;
}

.confirm {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
</style>
