<script setup lang="ts">
// Step 1: choose where the activities come from: files saved on this device (added here, and
// seen and deleted here), Strava, Ride with GPS, or the demo's made-up activities. One source
// is in use at a time, and only its card shows; "Use another source" shows them all to switch.
import { computed, ref, watch } from 'vue';
import ActivityGrid from '../components/ActivityGrid.vue';
import AddFiles from '../components/AddFiles.vue';
import GettingFiles from '../components/GettingFiles.vue';
import LoadingStatus from '../components/LoadingStatus.vue';
import type { EngineClient } from '../engine-client.ts';
import { countText } from '../format.ts';
import type { ActivitySummary } from '../messages.ts';
import { rememberStravaState } from '../strava-auth.ts';
import { CONNECT_URL } from '../use-ridewithgps.ts';

const props = defineProps<{
  engine: EngineClient;
  library: ActivitySummary[];
  stravaUrl: URL | null;
  stravaActive: boolean;
  stravaError: string;
  stravaBusy: string;
  /** Ride with GPS: offered by this site, connected in this browser, the source now. */
  rwgps: { available: boolean; connected: boolean; active: boolean; busy: string; error: string };
  demoActive: boolean;
  demoBusy: string;
  demoError: string;
}>();
const emit = defineEmits<{
  changed: [library: ActivitySummary[]];
  next: [];
  files: [];
  disconnect: [];
  demo: [];
  useRideWithGps: [];
  disconnectRideWithGps: [];
}>();

/** Whether Strava, Ride with GPS or the demo is the source instead of the files here. */
const otherSource = computed(() => props.stravaActive || props.rwgps.active || props.demoActive);
/**
 * The demo is for trying Wornways before adding anything: it is offered while there are no
 * activities on this device and Strava is not connected, and stays shown while it is open.
 */
const offerDemo = computed(
  () =>
    props.demoActive || (!props.stravaActive && !props.rwgps.active && props.library.length === 0),
);

type SourceCard = 'files' | 'strava' | 'rwgps' | 'demo';
/** The source in use; null while there is nothing to use yet (no files, nothing connected). */
const inUse = computed<SourceCard | null>(() =>
  props.stravaActive
    ? 'strava'
    : props.rwgps.active
      ? 'rwgps'
      : props.demoActive
        ? 'demo'
        : props.library.length
          ? 'files'
          : null,
);
/** Whether every source is shown to pick another one. */
const choosing = ref(false);
watch(inUse, () => (choosing.value = false));
/** Whether a source's card shows: all of them while choosing, else only the one in use. */
const shown = (card: SourceCard) => inUse.value === null || choosing.value || inUse.value === card;

const error = ref('');
const confirmingDeleteAll = ref(false);

function authorize(event: MouseEvent): void {
  try {
    if (props.stravaUrl) rememberStravaState(props.stravaUrl);
  } catch {
    event.preventDefault();
    error.value = 'Allow session storage in this browser to connect to Strava.';
  }
}

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
    <h1>Choose an activity source</h1>
    <!-- What the app is for, while there is nothing in it yet. -->
    <p v-if="!otherSource && library.length === 0" class="intro" data-testid="intro">
      Wornways turns your GPS activities into a short video: your routes build up over a street map,
      one after another or all at once, ready to share. Wornways makes your video on this device.
      Files you add stay here. Not ready to add yours?
      <button type="button" class="link" :disabled="!!demoBusy" @click="emit('demo')">
        See the demo first</button
      >.
    </p>
    <div class="sources">
      <section
        v-if="shown('files')"
        class="source-card"
        :class="{ 'in-use': inUse === 'files' }"
        data-testid="files-source"
      >
        <header class="source-heading">
          <h2>Files <span v-if="inUse === 'files'" class="tag">In use</span></h2>
          <p class="muted">
            FIT, GPX or TCX files, a folder, or an export ZIP. Activities are saved on this device
            for next time.
          </p>
        </header>
        <div class="source-content">
          <button v-if="otherSource" type="button" class="secondary" @click="emit('files')">
            Use files
          </button>
          <AddFiles v-else :engine="engine" @changed="emit('changed', $event)" />
          <GettingFiles />
        </div>
      </section>
      <section
        v-if="shown('strava') && (stravaUrl || stravaActive)"
        class="source-card"
        :class="{ 'in-use': inUse === 'strava' }"
        data-testid="strava-source"
      >
        <header class="source-heading">
          <h2>Strava <span v-if="inUse === 'strava'" class="tag">In use</span></h2>
          <p class="muted">Your connection and cached activities last up to two hours.</p>
        </header>
        <div class="source-content">
          <LoadingStatus v-if="stravaBusy" :text="stravaBusy" />
          <button v-else-if="stravaActive" type="button" class="link" @click="emit('disconnect')">
            Disconnect Strava
          </button>
          <a
            v-else-if="stravaUrl && !stravaBusy"
            :href="stravaUrl.href"
            class="strava-connect"
            @click="authorize"
          >
            <img src="/strava-connect.svg" alt="Connect with Strava" width="237" height="48" />
          </a>
          <div v-if="!stravaActive" class="connect-help muted">
            <p>If Strava says its connection limit was reached, go back and use activity files.</p>
            <p>
              <a class="link" href="/privacy.html" target="_blank" rel="noopener noreferrer"
                >Privacy</a
              >
              · Wornways reads activity names, dates, sports, distance, and GPS tracks. Manage
              access in
              <a
                class="link"
                href="https://www.strava.com/settings/apps"
                target="_blank"
                rel="noopener noreferrer"
                >Strava settings</a
              >.
            </p>
          </div>
        </div>
      </section>
      <section
        v-if="shown('rwgps') && rwgps.available"
        class="source-card"
        :class="{ 'in-use': inUse === 'rwgps' }"
        data-testid="rwgps-source"
      >
        <header class="source-heading">
          <h2>Ride with GPS <span v-if="inUse === 'rwgps'" class="tag">In use</span></h2>
          <p class="muted">
            Your trips. Tracks are downloaded when a video needs them and kept on this device until
            you disconnect.
          </p>
        </header>
        <div class="source-content">
          <LoadingStatus v-if="rwgps.busy" :text="rwgps.busy" />
          <template v-else-if="rwgps.connected">
            <button
              v-if="!rwgps.active"
              type="button"
              class="secondary"
              :disabled="!!rwgps.busy"
              @click="emit('useRideWithGps')"
            >
              Use Ride with GPS
            </button>
            <button
              type="button"
              class="link disconnect"
              :disabled="!!rwgps.busy"
              @click="emit('disconnectRideWithGps')"
            >
              Disconnect Ride with GPS
            </button>
          </template>
          <a v-else :href="CONNECT_URL" class="secondary"> Connect Ride with GPS </a>
          <div v-if="!rwgps.connected" class="connect-help muted">
            <p>
              <a class="link" href="/privacy.html" target="_blank" rel="noopener noreferrer"
                >Privacy</a
              >
              · Wornways reads trip names, dates, sports, distances, and GPS tracks, and never
              changes your account.
            </p>
          </div>
        </div>
      </section>
      <section
        v-if="shown('demo') && offerDemo"
        class="source-card"
        :class="{ 'in-use': inUse === 'demo' }"
        data-testid="demo-source"
      >
        <header class="source-heading">
          <h2>Demo <span v-if="inUse === 'demo'" class="tag">In use</span></h2>
          <p v-if="demoActive" class="muted">
            You are trying Wornways with made-up rides and runs in Mallorca. Leave the demo, or use
            another source, to add your own.
          </p>
          <p v-else class="muted">
            Not ready to add your own? Try Wornways with made-up rides and runs in Mallorca.
          </p>
        </header>
        <div class="source-content">
          <LoadingStatus v-if="demoBusy" :text="demoBusy" />
          <button
            v-else-if="!demoActive"
            type="button"
            class="secondary"
            :disabled="!!demoBusy"
            @click="emit('demo')"
          >
            Try the demo
          </button>
          <button v-else type="button" class="secondary" @click="emit('files')">
            Leave the demo
          </button>
        </div>
      </section>
    </div>
    <button
      v-if="inUse && !choosing"
      type="button"
      class="secondary another"
      @click="choosing = true"
    >
      Use another source
    </button>
    <p v-if="rwgps.error" class="error" role="alert">{{ rwgps.error }}</p>
    <p v-if="stravaError" class="error" role="alert">{{ stravaError }}</p>
    <p v-if="demoError" class="error" role="alert">{{ demoError }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <template v-if="!otherSource && library.length">
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
          Delete saved activities
        </button>
      </div>
      <ActivityGrid :rows="library" mode="delete" test-id="library" @delete="remove([$event])" />
    </template>

    <div class="footer">
      <span />
      <button
        type="button"
        class="primary"
        :disabled="!otherSource && library.length === 0"
        @click="emit('next')"
      >
        Continue →
      </button>
    </div>
  </section>
</template>

<style scoped>
.sources {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
  gap: 0.75rem;
  margin: 1rem 0 1.5rem;
}

.source-card {
  display: grid;
  grid-row: span 2;
  grid-template-rows: subgrid;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 12px;
}

.source-heading h2 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 1rem;
}

.source-card.in-use {
  border-color: var(--accent);
}

.tag {
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  color: #160a02;
  background: var(--accent);
  font-size: 0.75rem;
  font-weight: 600;
}

.another {
  margin: -0.75rem 0 1.5rem;
}

.source-heading p {
  margin: 0.35rem 0 0;
}

.source-card .source-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.source-card .source-content > button,
.source-card .source-content > a.secondary,
.strava-connect {
  align-self: start;
}

.strava-connect {
  max-width: 100%;
}

.source-card :deep(.drop) {
  margin: 0;
}

.source-card :deep(.report) {
  margin-top: 1rem;
}

.connect-help {
  display: grid;
  gap: 0.4rem;
  margin-top: 0.9rem;
  font-size: 0.85rem;
}

.connect-help p {
  margin: 0;
}

.strava-connect img {
  display: block;
  max-width: 100%;
  height: auto;
}

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

.disconnect {
  align-self: start;
  margin-top: 0.9rem;
}

.confirm {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
</style>
