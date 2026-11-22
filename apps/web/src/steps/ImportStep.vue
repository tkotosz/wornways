<script setup lang="ts">
// Step 1: where the activities come from. One source is chosen at a time: files saved on
// this device, Strava, Ride with GPS, or the demo's made-up activities; they are never mixed.
// Until one is chosen, and after "Change source", the step lists them to pick from. Once one
// is chosen, the step shows what that source needs: adding files, connecting, or starting
// the demo.
import { computed, onMounted, ref, watch } from 'vue';
import ActivityGrid from '../components/ActivityGrid.vue';
import AddFiles from '../components/AddFiles.vue';
import GettingFiles from '../components/GettingFiles.vue';
import SourceIcon from '../components/SourceIcon.vue';
import type { EngineClient } from '../engine-client.ts';
import { countText, timeText } from '../format.ts';
import type { ActivitySummary, Source } from '../messages.ts';
import { rememberStravaState } from '../strava-auth.ts';
import { CONNECT_URL } from '../use-ridewithgps.ts';

const props = defineProps<{
  engine: EngineClient;
  library: ActivitySummary[];
  /** The source chosen; null until the person picks one. */
  chosen: Source | null;
  /** Whether the chosen source is ready to go on with. */
  ready: boolean;
  stravaUrl: URL | null;
  stravaActive: boolean;
  /** When the Strava connection ends; null when not connected. */
  stravaUntil: number | null;
  stravaError: string;
  stravaBusy: string;
  /** Ride with GPS: offered by this site, connected in this browser, the source now. */
  rwgps: { available: boolean; connected: boolean; active: boolean; busy: string; error: string };
  demoBusy: string;
  demoError: string;
  /** The demo's activities while it is open. */
  demoRows: ActivitySummary[];
}>();
const emit = defineEmits<{
  changed: [library: ActivitySummary[]];
  choose: [source: Source];
  changeSource: [];
  next: [];
  disconnect: [];
  disconnectRideWithGps: [];
}>();

const NAMES: Record<Source, string> = {
  files: 'Files',
  strava: 'Strava',
  rwgps: 'Ride with GPS',
  demo: 'Demo',
};

/** Whether this browser is connected to Strava, also while another source is chosen. */
const stravaConnected = computed(() => !!props.stravaUntil && props.stravaUntil > Date.now());

/** How many tracks each service keeps on this device, for the source list. */
const counts = ref({ strava: 0, rwgps: 0 });
const withCount = (status: string, count: number) =>
  count ? `${status} · ${count} downloaded` : status;

async function readCounts(): Promise<void> {
  const count = (service: 'strava' | 'rwgps') =>
    props.engine.downloadedCount(service).catch(() => 0);
  const [strava, rwgps] = await Promise.all([count('strava'), count('rwgps')]);
  counts.value = { strava, rwgps };
}

/** Whether the list of sources shows. */
const listing = computed(() => props.chosen === null);

/**
 * How many activities the demo holds (public/demo/mallorca.zip). It loads only when picked,
 * so its card says it from here; a browser test checks the two agree.
 */
const DEMO_ACTIVITIES = 25;

/** The sources this site offers, in this order, each with where it stands. */
const choices = computed(() => {
  const list: { id: Source; about: string; status: string }[] = [
    {
      id: 'demo',
      about: 'Made-up rides and runs in Mallorca, to try Wornways first. Nothing is saved.',
      status: countText(DEMO_ACTIVITIES, 'made-up activity', 'made-up activities'),
    },
    {
      id: 'files',
      about: 'FIT, GPX or TCX files, a folder, or an export ZIP, saved on this device.',
      status: props.library.length
        ? `${countText(props.library.length, 'activity', 'activities')} on this device`
        : 'Nothing added yet',
    },
  ];
  if (props.rwgps.available)
    list.push({
      id: 'rwgps',
      about: 'Your Ride with GPS trips.',
      status: props.rwgps.connected ? withCount('Connected', counts.value.rwgps) : 'Not connected',
    });
  if (props.stravaUrl || props.stravaActive)
    list.push({
      id: 'strava',
      about: 'Your Strava activities, kept for up to two hours.',
      status: stravaConnected.value
        ? withCount(`Connected until ${timeText(props.stravaUntil!)}`, counts.value.strava)
        : 'Not connected',
    });
  return list;
});

const error = ref('');
const confirmingDeleteAll = ref(false);

/**
 * What the chosen service keeps on this device, read from the stored copies: nothing is
 * asked of Strava or Ride with GPS here.
 */
const downloaded = ref<ActivitySummary[]>([]);
const connectedService = computed(() =>
  props.chosen === 'strava' && stravaConnected.value
    ? 'strava'
    : props.chosen === 'rwgps' && props.rwgps.connected
      ? 'rwgps'
      : null,
);

async function readDownloaded(): Promise<void> {
  const service = connectedService.value;
  downloaded.value = service ? await props.engine.downloaded(service).catch(() => []) : [];
}
onMounted(readDownloaded);
watch(connectedService, readDownloaded);
onMounted(readCounts);
watch(listing, (shown) => shown && void readCounts());

/**
 * The activities the chosen source holds, shown under its screen: the files on this device,
 * the tracks a service keeps, or the demo's. The demo's cannot be deleted.
 */
const held = computed(() => {
  if (props.chosen === 'files')
    return {
      rows: props.library,
      heading: `${countText(props.library.length, 'activity', 'activities')} on this device`,
      deleteAll: 'Delete saved activities',
      testId: 'library',
      countId: 'activity-count',
    };
  if (connectedService.value)
    return {
      rows: downloaded.value,
      heading: `${countText(downloaded.value.length, 'activity', 'activities')} downloaded to this device`,
      deleteAll: 'Delete downloaded tracks',
      testId: 'downloaded',
      countId: 'downloaded-count',
    };
  if (props.chosen === 'demo')
    return {
      rows: props.demoRows,
      heading: `${countText(props.demoRows.length, 'made-up activity', 'made-up activities')}`,
      deleteAll: null,
      testId: 'demo-activities',
      countId: 'demo-count',
    };
  return null;
});

function authorize(event: MouseEvent): void {
  try {
    if (props.stravaUrl) rememberStravaState(props.stravaUrl);
  } catch {
    event.preventDefault();
    error.value = 'Allow session storage in this browser to connect to Strava.';
  }
}

/** Deletes files from the library, or tracks a service keeps (fetched again when needed). */
async function remove(ids: string[] | 'all'): Promise<void> {
  error.value = '';
  try {
    const service = connectedService.value;
    if (service) downloaded.value = await props.engine.forgetDownloaded(service, ids);
    else emit('changed', await props.engine.deleteActivities(ids));
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    confirmingDeleteAll.value = false;
  }
}
</script>

<template>
  <section>
    <template v-if="listing">
      <h1>Choose an activity source</h1>
      <!-- What the app is for, until a source is chosen. -->
      <p v-if="chosen === null" class="intro" data-testid="intro">
        Wornways turns your GPS activities into a short video: your routes build up over a street
        map, one after another or all at once, ready to share. Wornways makes your video on this
        device. Pick where your activities come from.
      </p>
      <div class="choices" data-testid="sources">
        <button
          v-for="c in choices"
          :key="c.id"
          type="button"
          class="choice"
          :data-testid="`choose-${c.id}`"
          @click="emit('choose', c.id)"
        >
          <SourceIcon class="icon" :source="c.id" />
          <span class="text">
            <strong>{{ NAMES[c.id] }}</strong>
            <span class="muted">{{ c.about }}</span>
            <span v-if="c.status" class="status">{{ c.status }}</span>
          </span>
        </button>
      </div>
    </template>

    <template v-else-if="chosen">
      <header class="chosen">
        <SourceIcon class="icon" :source="chosen" />
        <div>
          <p class="kicker">Current source</p>
          <h1 data-testid="chosen-source">{{ NAMES[chosen] }}</h1>
        </div>
      </header>

      <div v-if="chosen === 'files'" class="screen" data-testid="files-source">
        <p class="muted">
          FIT, GPX or TCX files, a folder, or an export ZIP. Activities are saved on this device for
          next time.
        </p>
        <AddFiles :engine="engine" @changed="emit('changed', $event)" />
        <GettingFiles />
      </div>

      <div v-else-if="chosen === 'strava'" class="screen" data-testid="strava-source">
        <p v-if="stravaBusy" class="muted" role="status">{{ stravaBusy }}</p>
        <template v-else-if="stravaConnected && stravaUntil">
          <p>
            Connected to Strava until {{ timeText(stravaUntil) }}. Tracks are downloaded when a
            video needs them and kept on this device until then.
          </p>
          <button type="button" class="secondary" @click="emit('disconnect')">
            Disconnect Strava
          </button>
        </template>
        <template v-else>
          <p class="muted">
            Your Strava activities. Tracks are downloaded when a video needs them and kept on this
            device for up to two hours after you connect.
          </p>
          <a v-if="stravaUrl" :href="stravaUrl.href" class="strava-connect" @click="authorize">
            <img src="/strava-connect.svg" alt="Connect with Strava" width="237" height="48" />
          </a>
          <p class="muted small">
            If Strava says its connection limit was reached, use activity files instead.
          </p>
        </template>
        <p v-if="!stravaBusy" class="muted small">
          <a class="link" href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>
          · Wornways reads activity names, dates, sports, distance, and GPS tracks. Manage access in
          <a
            class="link"
            href="https://www.strava.com/settings/apps"
            target="_blank"
            rel="noopener noreferrer"
            >Strava settings</a
          >.
        </p>
      </div>

      <div v-else-if="chosen === 'rwgps'" class="screen" data-testid="rwgps-source">
        <p v-if="rwgps.busy" class="muted" role="status">{{ rwgps.busy }}</p>
        <template v-else-if="rwgps.connected">
          <p>
            Connected to Ride with GPS. Tracks are downloaded when a video needs them and kept on
            this device until you disconnect.
          </p>
          <button type="button" class="secondary" @click="emit('disconnectRideWithGps')">
            Disconnect Ride with GPS
          </button>
        </template>
        <template v-else>
          <p class="muted">
            Your Ride with GPS trips. Tracks are downloaded when a video needs them and kept on this
            device until you disconnect.
          </p>
          <a :href="CONNECT_URL" class="secondary">Connect Ride with GPS</a>
        </template>
        <p v-if="!rwgps.busy" class="muted small">
          <a class="link" href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>
          · Wornways reads trip names, dates, sports, distances, and GPS tracks, and never changes
          your account.
        </p>
      </div>

      <div v-else class="screen" data-testid="demo-source">
        <p v-if="demoBusy" class="muted" role="status">{{ demoBusy }}</p>
        <template v-else>
          <p>
            Try Wornways with made-up rides and runs in Mallorca: a month of rides and runs from one
            town, a five-day tour of the island and one long climb. Nothing is saved.
          </p>
        </template>
      </div>
    </template>

    <p v-if="rwgps.error" class="error" role="alert">{{ rwgps.error }}</p>
    <p v-if="stravaError" class="error" role="alert">{{ stravaError }}</p>
    <p v-if="demoError" class="error" role="alert">{{ demoError }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <template v-if="!listing && held && held.rows.length">
      <div class="library-head">
        <h2 :data-testid="held.countId">{{ held.heading }}</h2>
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

    <div class="footer">
      <button v-if="!listing" type="button" class="secondary" @click="emit('changeSource')">
        ← Change source
      </button>
      <span v-else />
      <button type="button" class="primary" :disabled="!ready" @click="emit('next')">
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

.choices {
  display: grid;
  /* Two by two: up to four sources, so none is left alone on a row of three. */
  grid-template-columns: repeat(2, 1fr);
  gap: 0.8rem;
  margin: 1rem 0 1.5rem;
}

/* A card like a playback preset: the icon above, the name and its lines under it. */
.choice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.8rem;
  padding: 1.1rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  color: var(--text);
  background: var(--panel);
  text-align: left;
  font: inherit;
}

.choice:hover {
  border-color: var(--muted);
}

.choice:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.icon {
  flex: none;
  height: 2.6rem;
}

.text {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.text .muted {
  font-size: 0.82rem;
}

.status {
  font-size: 0.82rem;
  font-weight: 600;
}

.chosen {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.chosen h1 {
  margin: 0;
}

.kicker {
  margin: 0 0 0.2rem;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

/* Phones: the cards as rows, the icon beside the text. */
@media (max-width: 600px) {
  .choices {
    grid-template-columns: 1fr;
  }

  .choice {
    flex-direction: row;
    align-items: center;
  }

  /* A slot of one width, so the names line up; the icon sits in its middle. */
  .choice .icon {
    width: 3.4rem;
    height: 2.2rem;
    justify-content: center;
  }
}

.screen {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  margin: 1rem 0 1.5rem;
}

.screen p {
  margin: 0;
}

.screen > button,
.screen > a.secondary,
.strava-connect {
  align-self: start;
}

.screen :deep(.drop) {
  margin: 0;
}

.small {
  font-size: 0.85rem;
}

.strava-connect {
  max-width: 100%;
}

.strava-connect img {
  display: block;
  max-width: 100%;
  height: auto;
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
