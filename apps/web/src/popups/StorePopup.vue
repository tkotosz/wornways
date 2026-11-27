<script setup lang="ts">
// What the source keeps on this device. Files: adding files, and the saved activities, which
// can be deleted. Strava and Ride with GPS: the connection, which can be ended, and the
// tracks downloaded for videos (fetched again when needed). The demo: its made-up activities,
// which cannot be deleted. On the way to the editor (the files source with nothing added
// yet), "Choose activities" goes on once there are some. Opened from the top bar's Source, it
// is the source's page: at its top the source in use, with Switch source beside it.
import { computed, onMounted, ref } from 'vue';
import ActivityGrid from '../components/ActivityGrid.vue';
import AddFiles from '../components/AddFiles.vue';
import AppPopup from '../components/AppPopup.vue';
import GettingFiles from '../components/GettingFiles.vue';
import LoadingStatus from '../components/LoadingStatus.vue';
import SourceCard from '../components/SourceCard.vue';
import type { EngineClient } from '../engine-client.ts';
import { countText, timeText } from '../format.ts';
import type { ActivitySummary } from '../messages.ts';
import { SOURCE_NAMES } from '../sources.ts';

const props = defineProps<{
  engine: EngineClient;
  source: 'files' | 'demo' | 'strava' | 'rwgps';
  closable: boolean;
  /** On the way to the editor: the popup goes on to the activities. */
  flow: boolean;
  /** The files on this device, or the demo's activities. */
  library: ActivitySummary[];
  /** When the Strava connection ends. */
  stravaUntil: number | null;
  busy: string;
}>();
const emit = defineEmits<{
  close: [];
  menu: [];
  next: [];
  changed: [library: ActivitySummary[]];
  disconnect: [];
  switch: [];
}>();

const title = computed(() => {
  if (props.source === 'files') return 'Files on this device';
  if (props.source === 'demo') return 'Demo files';
  return `${SOURCE_NAMES[props.source]} connection`;
});

/** Under the source's name: that it is in use, and how it stands. */
const note = computed(() =>
  props.source === 'strava' && props.stravaUntil
    ? `In use · until ${timeText(props.stravaUntil)}`
    : 'In use',
);

const error = ref('');
const confirmingDeleteAll = ref(false);

/** The tracks a service keeps on this device, read from the stored copies. */
const downloaded = ref<ActivitySummary[]>([]);
onMounted(async () => {
  if (props.source === 'strava' || props.source === 'rwgps')
    downloaded.value = await props.engine.downloaded(props.source).catch(() => []);
});

/** What is listed under the source's screen; the demo's activities cannot be deleted. */
const held = computed(() => {
  if (props.source === 'files')
    return {
      rows: props.library,
      heading: `${countText(props.library.length, 'activity', 'activities')} on this device`,
      deleteAll: 'Delete saved activities',
      testId: 'library',
      countId: 'activity-count',
    };
  if (props.source === 'demo')
    return {
      rows: props.library,
      heading: countText(props.library.length, 'made-up activity', 'made-up activities'),
      deleteAll: null,
      testId: 'demo-activities',
      countId: 'demo-count',
    };
  return {
    rows: downloaded.value,
    heading: `${countText(downloaded.value.length, 'activity', 'activities')} downloaded to this device`,
    deleteAll: 'Delete downloaded tracks',
    testId: 'downloaded',
    countId: 'downloaded-count',
  };
});

/** Deletes files from the library, or tracks a service keeps (fetched again when needed). */
async function remove(ids: string[] | 'all'): Promise<void> {
  error.value = '';
  try {
    if (props.source === 'files') emit('changed', await props.engine.deleteActivities(ids));
    else if (props.source !== 'demo')
      downloaded.value = await props.engine.forgetDownloaded(props.source, ids);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    confirmingDeleteAll.value = false;
  }
}
</script>

<template>
  <AppPopup :title="title" :closable="closable" @close="emit('close')" @menu="emit('menu')">
    <SourceCard :source="source" :note="note" @switch="emit('switch')" />
    <div v-if="source === 'files'" class="screen" data-testid="files-source">
      <p class="muted">
        FIT, GPX or TCX files, a folder, or an export ZIP. Activities are saved on this device for
        next time.
      </p>
      <AddFiles :engine="engine" @changed="emit('changed', $event)" />
      <GettingFiles />
    </div>

    <div v-else-if="source === 'demo'" class="screen" data-testid="demo-source">
      <p class="muted">
        Made-up activities in Mallorca, for trying the app. They come with it, so they cannot be
        deleted.
      </p>
    </div>

    <div v-else class="screen" :data-testid="`${source}-source`">
      <LoadingStatus v-if="busy" :text="busy" />
      <template v-else>
        <p v-if="source === 'strava' && stravaUntil">
          Connected to Strava until {{ timeText(stravaUntil) }}. Tracks are downloaded when a video
          needs them and kept on this device until then.
        </p>
        <p v-else-if="source === 'rwgps'">
          Connected to Ride with GPS. Tracks are downloaded when a video needs them and kept on this
          device until you disconnect.
        </p>
        <button type="button" class="secondary" @click="emit('disconnect')">
          Disconnect {{ SOURCE_NAMES[source] }}
        </button>
      </template>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <template v-if="held.rows.length">
      <div class="library-head">
        <h3 :data-testid="held.countId">{{ held.heading }}</h3>
        <template v-if="held.deleteAll">
          <span v-if="confirmingDeleteAll" class="confirm">
            Delete all of them?
            <button type="button" class="danger" @click="remove('all')">Delete all</button>
            <button type="button" class="link" @click="confirmingDeleteAll = false">
              Keep them
            </button>
          </span>
          <button v-else type="button" class="link" @click="confirmingDeleteAll = true">
            {{ held.deleteAll }}
          </button>
        </template>
      </div>
      <ActivityGrid
        :rows="held.rows"
        :mode="held.deleteAll ? 'delete' : 'list'"
        :test-id="held.testId"
        @delete="remove([$event])"
      />
    </template>

    <template v-if="flow" #footer>
      <button
        type="button"
        class="primary"
        :disabled="source === 'files' && !library.length"
        @click="emit('next')"
      >
        Choose activities
      </button>
    </template>
  </AppPopup>
</template>

<style scoped>
.screen {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.screen p {
  margin: 0;
}

.screen > button {
  align-self: start;
}

.screen :deep(.drop) {
  margin: 0;
}

.library-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  margin: 1.5rem 0 0.8rem;
}

.library-head h3 {
  margin: 0;
  font-size: 1.05rem;
}

.confirm {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
</style>
