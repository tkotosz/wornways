<script setup lang="ts">
// Step 1: add activity files, folders or an export archive; see and delete what is stored.
import { computed, ref } from 'vue';
import ActivityGrid from '../components/ActivityGrid.vue';
import AddFiles from '../components/AddFiles.vue';
import GettingFiles from '../components/GettingFiles.vue';
import ModalPanel from '../components/ModalPanel.vue';
import type { EngineClient } from '../engine-client.ts';
import { countText } from '../format.ts';
import type { ActivitySummary } from '../messages.ts';
import { rememberStravaState } from '../strava-auth.ts';

const props = defineProps<{
  engine: EngineClient;
  library: ActivitySummary[];
  stravaUrl: URL | null;
  stravaActive: boolean;
  stravaError: string;
  stravaBusy: string;
  garminAvailable: boolean;
  garminActive: boolean;
  garminError: string;
  garminBusy: string;
}>();
const emit = defineEmits<{
  changed: [library: ActivitySummary[]];
  next: [];
  files: [];
  disconnect: [];
  connectGarmin: [key: string];
  disconnectGarmin: [];
}>();

const error = ref('');
const confirmingDeleteAll = ref(false);
const garminForm = ref<HTMLFormElement | null>(null);
const remote = computed(() => props.stravaActive || props.garminActive);
const sources = computed(() => props.stravaUrl || remote.value || props.garminAvailable);
const busy = computed(() => props.stravaBusy || props.garminBusy);

function submitGarmin(event: Event, close: () => void): void {
  if (busy.value || remote.value) return;
  const form = event.currentTarget as HTMLFormElement;
  const key = String(new FormData(form).get('key') ?? '').trim();
  if (!key) return;
  form.reset();
  close();
  emit('connectGarmin', key);
}

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
    <p v-if="!remote && library.length === 0" class="intro" data-testid="intro">
      Wornways turns your GPS activities into a short video: your routes build up over a street map,
      one after another or all at once, ready to share. Wornways makes your video on this device.
      Files you add stay here.
    </p>
    <div :class="{ sources, 'three-sources': stravaUrl && garminAvailable }">
      <section :class="{ 'source-card': sources }">
        <header v-if="sources" class="source-heading">
          <h2>Files</h2>
          <p class="muted">Activities are saved on this device for next time.</p>
        </header>
        <p v-else class="muted">
          Add FIT, GPX or TCX files, a folder, or an export ZIP. Wornways reads them here in your
          browser and keeps the activities on this device for next time.
        </p>
        <div class="source-content">
          <button v-if="remote" type="button" class="secondary" @click="emit('files')">
            Use files
          </button>
          <AddFiles v-else :engine="engine" @changed="emit('changed', $event)" />
          <GettingFiles />
        </div>
      </section>
      <section v-if="stravaUrl || stravaActive" class="source-card">
        <header class="source-heading">
          <h2>Strava</h2>
          <p class="muted">Your connection and cached activities last up to two hours.</p>
        </header>
        <div class="source-content">
          <button v-if="stravaActive" type="button" class="link" @click="emit('disconnect')">
            Disconnect Strava
          </button>
          <button v-else-if="garminActive" type="button" class="secondary" @click="emit('files')">
            Use Strava
          </button>
          <a
            v-else-if="stravaUrl && !busy"
            :href="stravaUrl.href"
            class="strava-connect"
            @click="authorize"
          >
            <img src="/strava-connect.svg" alt="Connect with Strava" width="237" height="48" />
          </a>
          <div v-if="!remote" class="connect-help muted">
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
      <section v-if="garminAvailable || garminActive" class="source-card">
        <header class="source-heading">
          <h2>Garmin Connect</h2>
          <p class="muted">Replay your own activities with a Personal API key.</p>
        </header>
        <div class="source-content">
          <button v-if="garminActive" type="button" class="link" @click="emit('disconnectGarmin')">
            Disconnect Garmin Connect
          </button>
          <button v-else-if="stravaActive" type="button" class="secondary" @click="emit('files')">
            Use Garmin Connect
          </button>
          <ModalPanel v-else title="Connect to Garmin Connect" @closed="garminForm?.reset()">
            <template #trigger="{ open }">
              <button
                type="button"
                class="secondary garmin-connect"
                :disabled="!!busy"
                aria-haspopup="dialog"
                @click="open"
              >
                Connect to Garmin
              </button>
            </template>
            <template #default="{ close }">
              <form
                ref="garminForm"
                class="garmin-form"
                @submit.prevent="submitGarmin($event, close)"
              >
                <p>
                  Create a key in your
                  <a
                    class="link"
                    href="https://connect.garmin.com/app/settings/personalApiToken"
                    target="_blank"
                    rel="noopener noreferrer"
                    >Garmin Connect settings</a
                  >. Use your key only on a Wornways installation you control.
                </p>
                <p>
                  Wornways sends the key to Garmin through this installation to start the session.
                  The key is discarded after the exchange. Activities stay in this tab for up to two
                  hours.
                </p>
                <label>
                  Garmin Personal API key
                  <input name="key" type="password" autocomplete="off" required maxlength="512" />
                </label>
                <button type="submit" class="primary">Connect</button>
              </form>
            </template>
          </ModalPanel>
        </div>
      </section>
    </div>
    <p v-if="busy" class="muted" role="status">{{ busy }}</p>
    <p v-if="stravaError" class="error" role="alert">{{ stravaError }}</p>
    <p v-if="garminError" class="error" role="alert">{{ garminError }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <template v-if="!remote && library.length">
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
        :disabled="!remote && (library.length === 0 || !!garminBusy)"
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

.three-sources {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
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
  margin: 0;
  font-size: 1rem;
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
.garmin-connect,
.strava-connect {
  align-self: start;
}

.garmin-connect:disabled {
  opacity: 0.4;
  cursor: default;
}

.garmin-form,
.garmin-form label {
  display: grid;
  gap: 0.5rem;
}

.garmin-form {
  gap: 1rem;
}

.garmin-form p {
  margin: 0;
}

.garmin-form input {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.5rem 0.75rem;
  color: var(--text);
  background: var(--background);
  font: inherit;
  font-size: 1rem;
}

.garmin-form button {
  justify-self: start;
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

.confirm {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
</style>
