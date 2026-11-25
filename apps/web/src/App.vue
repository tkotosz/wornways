<script setup lang="ts">
// The app's frame: the header, the step bar and the current step. It holds what the steps
// share: the library, the choice of activities, and which activities that choice matches.
import { SETTINGS, type SettingsInput } from '@wornways/engine';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { missingSupport } from './browser-support.ts';
import {
  adjustSettings,
  countOf,
  loadAdjustments,
  saveAdjustments,
  type Adjustments,
  type Section,
} from './adjust.ts';
import {
  NO_CHOICE,
  choiceSettings,
  distanceRange,
  placeMissing,
  placeSettings,
  type Choice,
} from './choice.ts';
import DownloadDialog from './components/DownloadDialog.vue';
import ModalPanel from './components/ModalPanel.vue';
import type { EngineClient } from './engine-client.ts';
import { install, installOffer, showsAppleInstallHelp } from './install.ts';
import type { MadeVideo } from './made-video.ts';
import type { ActivitySummary, MatchReport, PlanReport, Source } from './messages.ts';
import ActivitiesStep from './steps/ActivitiesStep.vue';
import ExportStep from './steps/ExportStep.vue';
import ImportStep from './steps/ImportStep.vue';
import DesignStep from './steps/DesignStep.vue';
import { STEPS, type Step } from './step-list.ts';
import { useDemo } from './use-demo.ts';
import { useMatches } from './use-matches.ts';
import { useRideWithGps } from './use-ridewithgps.ts';
import { useStrava } from './use-strava.ts';

const props = defineProps<{ engine: EngineClient }>();

const steps = STEPS;
/** The Design step's open section, kept while the app is open, like the step. */
const section = ref<Section>('frame');
const stepIndex = computed(() => steps.findIndex((s) => s.id === step.value));
/** The home screen: the list of sources, before one is chosen. */
const home = computed(() => step.value === 'import' && chosen.value === null);

const unsupported = missingSupport();
const version = WORNWAYS_VERSION;
const step = ref<Step>('import');
const loaded = ref(false);
const libraryError = ref('');
const library = ref<ActivitySummary[]>([]);
const fileAdjustments = ref<Adjustments>(loadAdjustments());
const stravaAdjustments = ref<Adjustments>({});
const fileChoice = ref<Choice>({ ...NO_CHOICE });
const { matches: fileMatches, matching: fileMatching } = useMatches(
  props.engine,
  'files',
  fileChoice,
  library,
);
const demo = useDemo(props.engine);
const {
  active: strava,
  ready: stravaReady,
  busy: stravaBusy,
  choice: stravaChoice,
  error: stravaError,
  notice: stravaNotice,
  matched: stravaMatches,
  matching: stravaMatching,
  rows: stravaRows,
  url: stravaUrl,
  until: stravaUntil,
  returning: stravaReturning,
  unanswered: stravaUnanswered,
  status: stravaStatus,
  connect: connectStrava,
  close: closeStrava,
  end: endStrava,
  retry: retryStrava,
  prepare: prepareStrava,
  download: stravaDownload,
} = useStrava(
  props.engine,
  stravaAdjustments,
  () => {
    step.value = 'import';
    video.value = null;
    stravaAdjustments.value = {};
  },
  () => {
    if (step.value !== 'import') step.value = 'activities';
    video.value = null;
  },
);

const rwgps = useRideWithGps(props.engine, () => {
  step.value = 'import';
  video.value = null;
});

const toast = ref('');
/** iPhone and iPad install only from Safari's Share menu; the Install button explains how. */
const appleInstallHelp = showsAppleInstallHelp();
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function showToast(text: string): void {
  toast.value = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 5000);
}

async function disconnectStrava(): Promise<void> {
  if (!(await endStrava(true))) return;
  showToast('Strava disconnected and temporary activities cleared.');
}

async function disconnectRideWithGps(): Promise<void> {
  if (!(await rwgps.disconnect())) return;
  showToast('Ride with GPS disconnected and its downloaded tracks cleared.');
}

onBeforeUnmount(() => clearTimeout(toastTimer));

/** The key the chosen source is remembered under, for the next visit. */
const CHOSEN = 'wornways-source';
const SOURCES: Source[] = ['files', 'strava', 'rwgps', 'demo'];

/** The source chosen on the last visit; null when none is remembered. */
function rememberedSource(): Source | null {
  try {
    const saved = localStorage.getItem(CHOSEN);
    return SOURCES.find((s) => s === saved) ?? null;
  } catch {
    return null;
  }
}

/** The source the person chose; null until they pick one. Only it is ever open. */
const chosen = ref<Source | null>(rememberedSource());
watch(chosen, (id) => {
  try {
    if (id) localStorage.setItem(CHOSEN, id);
    else localStorage.removeItem(CHOSEN);
  } catch {
    // Remembering is optional when browser storage is blocked.
  }
});

/** Whether the chosen source has activities to go on with. */
const usable = computed(() => {
  switch (chosen.value) {
    case 'files':
      return library.value.length > 0;
    case 'strava':
      return strava.value;
    case 'rwgps':
      return rwgps.active.value;
    case 'demo':
      return demo.active.value;
    default:
      return false;
  }
});

/** Where the activities come from: Strava, Ride with GPS or the demo while open, else this device. */
const source = computed<Source>(() =>
  strava.value ? 'strava' : rwgps.active.value ? 'rwgps' : demo.active.value ? 'demo' : 'files',
);
/** The tracks being downloaded before going on from the Activities step, if any. */
const download = computed(() =>
  source.value === 'strava'
    ? { service: 'Strava', progress: stravaDownload.value }
    : { service: 'Ride with GPS', progress: rwgps.download.value },
);
/** Whether a connected service is the source: its tracks are fetched before going on. */
const remote = computed(() => source.value === 'strava' || source.value === 'rwgps');
/** What each source keeps of its own: its activities, choice, matches and adjustments. */
const current = computed(() => {
  if (source.value === 'strava')
    return {
      rows: stravaRows,
      choice: stravaChoice,
      matches: stravaMatches,
      matching: stravaMatching,
      adjustments: stravaAdjustments,
    };
  if (source.value === 'rwgps')
    return {
      rows: rwgps.rows,
      choice: rwgps.choice,
      matches: rwgps.matches,
      matching: rwgps.matching,
      // The look of the video is the person's, whichever source: the same as for files.
      adjustments: fileAdjustments,
    };
  if (source.value === 'demo') return demo;
  return {
    rows: library,
    choice: fileChoice,
    matches: fileMatches,
    matching: fileMatching,
    adjustments: fileAdjustments,
  };
});

const choice = computed({
  get: () => current.value.choice.value,
  set: (after: Choice) => (current.value.choice.value = after),
});
const sourceRows = computed(() => current.value.rows.value);
const activityMatch = computed(() => current.value.matches.value);
const matching = computed(() => current.value.matching.value);
const distances = computed(() => new Map(sourceRows.value.map((a) => [a.id, a.distanceM / 1000])));
const awaitingPlace = computed(() => placeMissing(choice.value));
const distanceScale = computed(() => {
  if (awaitingPlace.value) return null;
  const distanceById = distances.value;
  let min = Infinity;
  let max = -Infinity;
  for (const id of activityMatch.value.ids) {
    const km = distanceById.get(id);
    if (km === undefined || !Number.isFinite(km) || km < 0) continue;
    min = Math.min(min, km);
    max = Math.max(max, km);
  }
  return min < max ? { min: Math.floor(min), max: Math.ceil(max) } : null;
});
const matched = computed<MatchReport>(() => {
  const match = activityMatch.value;
  const range = distanceRange(choice.value);
  if (!range) return { ...match, ids: [] };
  if ((range.min === -Infinity && range.max === Infinity) || !match.ids.length) return match;

  const distanceById = distances.value;
  const ids = match.ids.filter((id) => {
    const km = distanceById.get(id);
    return km !== undefined && km >= range.min && km <= range.max;
  });
  return { ids, problem: ids.length ? match.problem : 'No activities match the distance range.' };
});

const chosenIds = computed(() => {
  const excluded = new Set(choice.value.excluded);
  return matched.value.ids.filter((id) => !excluded.has(id));
});

// What was set in the Video and Text steps, kept for the next visit.
const adjustments = computed({
  get: () => current.value.adjustments.value,
  set: (after: Adjustments) => (current.value.adjustments.value = after),
});
watch(fileAdjustments, saveAdjustments);

/** The settings of the video: the chosen activities and the adjustments. */
const settings = computed<SettingsInput>(() => ({
  ...(remote.value
    ? { ...placeSettings(choice.value, new Date()), activity: chosenIds.value }
    : choiceSettings(choice.value, matched.value.ids, new Date())),
  ...adjustSettings(adjustments.value, countOf(chosenIds.value.length)),
}));

const plan = ref<PlanReport | null>(null);
const planError = ref('');
const planningSettings = computed(() => {
  const input = settings.value;
  return Object.fromEntries(
    SETTINGS.filter(
      (s) =>
        ['activities', 'timing', 'privacy'].includes(s.group) ||
        ['camera', 'end-card'].includes(s.name),
    ).map(({ name }) => [name, input[name]]),
  );
});
watch(
  [() => stepIndex.value >= 2, () => JSON.stringify(planningSettings.value), source],
  async ([show, key], _, onCleanup) => {
    plan.value = null;
    planError.value = '';
    if (!show) return;
    let current = true;
    onCleanup(() => (current = false));
    try {
      const result = await props.engine.plan(JSON.parse(key));
      if (current) plan.value = result;
    } catch (error) {
      if (current) planError.value = error instanceof Error ? error.message : String(error);
    }
  },
);

// The last video made, in memory only. It stays while what it shows stays the same, so going
// back and forward shows it again; any change to the settings or the library discards it.
const video = ref<MadeVideo | null>(null);
watch(video, (_, before) => {
  if (before) URL.revokeObjectURL(before.url);
});
watch(settings, () => {
  if (video.value && video.value.settingsKey !== JSON.stringify(settings.value)) video.value = null;
});
watch([library, source], () => (video.value = null));

/** Whether a step can be opened: later steps need the chosen source ready, and a choice. */
function reachable(id: Step): boolean {
  if (id === 'import') return true;
  if (!usable.value) return false;
  return (
    id === 'activities' ||
    (chosenIds.value.length > 0 &&
      !awaitingPlace.value &&
      !stravaBusy.value &&
      !rwgps.busy.value &&
      !matching.value)
  );
}

async function navigate(id: Step): Promise<void> {
  if (!reachable(id)) return;
  if (remote.value && step.value === 'activities' && id !== 'activities' && id !== 'import') {
    const ids = chosenIds.value.join(',');
    const prepare = strava.value ? prepareStrava : rwgps.prepare;
    if (!(await prepare(chosenIds.value))) return;
    if (step.value !== 'activities' || ids !== chosenIds.value.join(',')) return;
  }
  if (remote.value && step.value === 'import' && id !== 'activities' && id !== 'import') {
    // Returning from the source picker can use a selection edited in Activities.
    step.value = 'activities';
    await navigate(id);
    return;
  }
  step.value = id;
}

// The top bar's height, for whatever else sticks to the top of the window below it.
const topBar = ref<HTMLElement | null>(null);
const topBarSize = new ResizeObserver(([entry]) => {
  const height = entry?.target.getBoundingClientRect().height ?? 0;
  document.documentElement.style.setProperty('--top-bar-height', `${height}px`);
});
watch(topBar, (bar) => {
  topBarSize.disconnect();
  if (bar) topBarSize.observe(bar);
});
onBeforeUnmount(() => topBarSize.disconnect());

/** Lets go of every source but the one given: they are never mixed. */
async function release(keep: Source | null): Promise<void> {
  // Strava's connection stays for its two hours, as Ride with GPS's does for its 30 days.
  if (keep !== 'strava') await closeStrava();
  if (keep !== 'rwgps') await rwgps.close();
  if (keep !== 'demo') await demo.close();
}

/**
 * Makes a source the chosen one and shows its screen, from what is stored on this device:
 * nothing is asked of Strava or Ride with GPS until Continue. The demo loads its activities,
 * which ship with the app, to show them.
 */
async function choose(id: Source): Promise<void> {
  chosen.value = id;
  await release(id);
  if (id === 'demo' && !demo.active.value) await demo.open();
}

/** Whether Continue can go on: the chosen source is ready, or a service is connected. */
const startable = computed(() => {
  if (usable.value) return true;
  switch (chosen.value) {
    case 'demo':
      return !demo.busy.value;
    case 'strava':
      return !!stravaUntil.value && stravaUntil.value > Date.now();
    case 'rwgps':
      return rwgps.connected.value;
    default:
      return false;
  }
});

/** Opens Ride with GPS on the Activities step, where its trips load; back here on failure. */
async function openRideWithGps(): Promise<void> {
  const opening = rwgps.open();
  step.value = 'activities';
  if (!(await opening)) step.value = 'import';
}

/**
 * "Change source": no source is chosen any more, so the Source step lists them all and the
 * later steps wait for a new choice. Connections stay as they are.
 */
async function changeSource(): Promise<void> {
  chosen.value = null;
  step.value = 'import';
  await release(null);
}

/** Continue on the Source step: opens the chosen source; its list loads on the next step. */
async function continueFromSource(): Promise<void> {
  if (chosen.value === 'demo' && !demo.active.value && !(await demo.open())) return;
  if (chosen.value === 'strava' && !strava.value && !(await connectStrava(fileAdjustments.value)))
    return;
  if (chosen.value === 'rwgps' && !rwgps.active.value) return openRideWithGps();
  await navigate('activities');
}

// Each step starts at the top of the page.
watch(step, () => window.scrollTo({ top: 0 }));

async function loadLibrary(): Promise<void> {
  libraryError.value = '';
  try {
    library.value = await props.engine.readLibrary();
    loaded.value = true;
    const [rwgpsJustConnected, stravaKept] = await Promise.all([rwgps.check(), stravaStatus()]);
    // Coming back from connecting a service chooses it.
    if (rwgpsJustConnected) chosen.value = 'rwgps';
    else if (stravaReturning) chosen.value = 'strava';
    // Only the chosen source opens, and its list loads on the Activities step; the other
    // connections stay as they are.
    if (chosen.value === 'strava') await connectStrava(fileAdjustments.value);
    else if (stravaKept) await props.engine.keepStrava(stravaKept).catch(() => {});
    if (chosen.value === 'demo') await demo.open();
    if (chosen.value === 'rwgps' && rwgps.connected.value) await openRideWithGps();
    else if (usable.value) step.value = 'activities';
  } catch (error) {
    libraryError.value = error instanceof Error ? error.message : String(error);
  }
}

onMounted(() => {
  if (unsupported) return;
  void loadLibrary();
});
</script>

<template>
  <!-- The header and the step bar stay at the top of the window while a step scrolls. -->
  <!-- The app's header shows on wide screens, and on phones only on the home screen (the list
       of sources); elsewhere phones have only the step bar (#step-nav). -->
  <div ref="topBar" class="top-bar" :class="{ editing: step === 'design', home }">
    <header class="header">
      <span class="brand">
        <img class="mark" src="/icons/route.svg" alt="" />
        <span class="name">
          <span class="wordmark"><b>worn</b>ways</span>
          <span class="version" data-testid="version" :title="version">{{ version }}</span>
        </span>
      </span>
      <span class="aside">
        <span class="muted promise">Your files stay on this device</span>
        <ModalPanel title="About Wornways">
          <template #trigger="{ open }">
            <button type="button" class="link about-trigger" aria-haspopup="dialog" @click="open">
              About
            </button>
          </template>
          <p class="about-copy">
            Wornways turns GPS activities into short videos that show your routes on a map. It makes
            videos in your browser. Activities you import from files stay on this device.
          </p>
          <p class="about-copy">Wornways is open source under the MIT License.</p>
          <nav class="about-links" aria-label="Project links">
            <a class="link" href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>
            <a
              class="link"
              href="https://github.com/tkotosz/wornways"
              target="_blank"
              rel="noopener"
            >
              Source on GitHub
            </a>
            <a class="link" href="/licenses.txt" target="_blank" rel="noopener">Licenses</a>
          </nav>
        </ModalPanel>
        <button v-if="installOffer" type="button" class="secondary install" @click="install">
          Install app
        </button>
        <ModalPanel v-else-if="appleInstallHelp" title="Install Wornways">
          <template #trigger="{ open }">
            <button type="button" class="secondary install" aria-haspopup="dialog" @click="open">
              Install app
            </button>
          </template>
          <ol class="install-steps">
            <li>Tap <b>Share</b> (the square with an arrow) in the browser's toolbar.</li>
            <li>
              Choose <b>Add to Home Screen</b>. You may need to scroll down, or tap <b>More</b>, to
              see it.
            </li>
            <li>Tap <b>Add</b>. Wornways then opens from your Home Screen like an app.</li>
          </ol>
        </ModalPanel>
      </span>
    </header>
    <nav v-if="!unsupported && loaded && !home" class="steps-row" aria-label="Steps">
      <!-- Wide screens: a pill per step, a tick on the steps behind. -->
      <ol class="steps">
        <li v-for="(s, i) in steps" :key="s.id">
          <button
            type="button"
            :class="{ current: s.id === step, done: i < stepIndex }"
            :aria-current="s.id === step ? 'step' : undefined"
            :aria-label="s.label"
            :disabled="!reachable(s.id)"
            @click="navigate(s.id)"
          >
            <span class="symbol" aria-hidden="true">{{ i < stepIndex ? '✓' : i + 1 }}</span>
            {{ s.label }}
          </button>
        </li>
      </ol>
    </nav>
    <!-- Phones: the step's bar (StepBar), with the way back, the step and the way on. -->
    <div id="step-nav" class="step-nav" />
  </div>

  <main class="main">
    <p v-if="unsupported" class="error" role="alert">{{ unsupported }}</p>
    <div v-else-if="libraryError">
      <p class="error" role="alert">{{ libraryError }}</p>
      <button type="button" class="secondary" @click="loadLibrary">Try again</button>
    </div>
    <template v-else-if="loaded">
      <ImportStep
        v-if="step === 'import'"
        :engine="engine"
        :library="library"
        :chosen="chosen"
        :ready="startable"
        :strava-url="stravaUrl"
        :strava-active="strava"
        :strava-until="stravaUntil"
        :strava-error="stravaError"
        :strava-busy="stravaBusy"
        :strava-unanswered="stravaUnanswered"
        :rwgps="{
          available: rwgps.available.value,
          connected: rwgps.connected.value,
          active: rwgps.active.value,
          busy: rwgps.busy.value,
          error: rwgps.error.value,
        }"
        :demo-busy="demo.busy.value"
        :demo-error="demo.error.value"
        :demo-rows="demo.rows.value"
        @changed="library = $event"
        @choose="choose"
        @change-source="changeSource()"
        @disconnect="disconnectStrava"
        @disconnect-ride-with-gps="disconnectRideWithGps()"
        @next="continueFromSource()"
      />
      <ActivitiesStep
        v-else-if="step === 'activities'"
        v-model="choice"
        :engine="engine"
        :library="sourceRows"
        :matched="matched"
        :distance-scale="distanceScale"
        :strava="strava"
        :source="source"
        :busy="source === 'rwgps' ? rwgps.busy.value : stravaBusy"
        :matching="matching"
        :notice="source === 'rwgps' ? rwgps.notice.value : stravaNotice"
        :can-retry="strava && (!stravaReady || sourceRows.length === 0)"
        @back="navigate('import')"
        @next="navigate('design')"
        @change-source="changeSource()"
        @retry="retryStrava()"
      />
      <DesignStep
        v-else-if="step === 'design'"
        v-model="adjustments"
        v-model:section="section"
        :engine="engine"
        :settings="settings"
        :activities="chosenIds.length"
        :plan="plan"
        @back="step = 'activities'"
        @next="step = 'export'"
      />
      <ExportStep
        v-else
        v-model:video="video"
        :engine="engine"
        :settings="settings"
        :plan="plan"
        :plan-error="planError"
        @back="step = 'design'"
      />
    </template>
  </main>

  <DownloadDialog
    v-if="download.progress"
    :service="download.service"
    :progress="download.progress"
  />

  <div class="toast-region" aria-live="polite" aria-atomic="true">
    <p v-if="toast" class="toast">{{ toast }}</p>
  </div>
</template>

<style scoped>
.top-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--background);
  border-bottom: 1px solid var(--line);
}

/* Phones: the Design step is an editor screen with a top bar of its own; past the home
   screen, the step bar takes the header's place. */
@media (max-width: 760px) {
  .top-bar.editing {
    display: none;
  }

  .top-bar:not(.home) .header {
    display: none;
  }
}

.header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.6rem 1rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--line);
  font-size: 0.85rem;
}

.brand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.55rem;
}

/* As tall as the name and the version together, so the three read as one block. */
.mark {
  height: 2.25rem;
}

/* The version in small type under the name, so the header grows only a little. Line
   heights of whole pixels keep the header a whole number of pixels tall: a fraction makes
   the Back and Next bar shift by a pixel while the page scrolls. */
.name {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.name .wordmark {
  line-height: 1.5rem;
}

.version {
  overflow: hidden;
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 500;
  line-height: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aside {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 1rem;
}

.about-trigger {
  min-height: 1.5rem;
}

.about-copy {
  margin: 0 0 0.85rem;
}

.about-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.15rem;
}

.install {
  padding: 0.35rem 0.8rem;
  font-size: 0.85rem;
}

.install-steps {
  display: grid;
  gap: 0.6rem;
  margin: 0;
  padding-left: 1.3rem;
  line-height: 1.5;
}

/* Phones: one row. The first step says that files stay on the device, and a long version
   ends in … rather than moving About to a row of its own. */
@media (max-width: 560px) {
  /* Tighter, to leave the screen to the steps (10 px: whole pixels, as above). */
  .header {
    flex-wrap: nowrap;
    padding-block: 0.625rem;
  }

  .promise {
    display: none;
  }
}

/* The name in the mark's orange gradient, over the whole word. */
.wordmark {
  font-size: 1.35rem;
  font-weight: 300;
  background: linear-gradient(90deg, #ffab1f, #ff5a1f);
  background-clip: text;
  color: transparent;
}

.wordmark b {
  font-weight: 700;
}

.main {
  max-width: 820px;
  margin: 0 auto;
  /* No padding at the bottom: the Back and Next bar ends the page, so the place it sticks
     to while scrolling is the place it ends up at, and it does not move at the end. */
  padding: 1.5rem 1.5rem 0;
}

.toast-region {
  position: fixed;
  top: calc(var(--top-bar-height, 0px) + 1rem);
  right: 1rem;
  left: 1rem;
  z-index: 15;
  display: flex;
  justify-content: flex-end;
  pointer-events: none;
}

.toast {
  max-width: 24rem;
  margin: 0;
  padding: 0.75rem 1rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
  box-shadow: 0 6px 20px rgb(0 0 0 / 40%);
  font-size: 0.85rem;
  line-height: 1.4;
}

.steps-row {
  max-width: 820px;
  margin: 0 auto;
  padding: 1rem 1.5rem;
}

.steps {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.55rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.steps button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.45rem 0.95rem;
  color: var(--muted);
  background: transparent;
  font-size: 0.85rem;
}

.steps .symbol {
  min-width: 0.9rem;
  font-size: 0.75rem;
  text-align: center;
}

.steps button:not(:disabled):hover {
  color: var(--text);
  border-color: var(--muted);
}

.steps button.done {
  color: var(--text);
}

.steps button.done .symbol {
  color: var(--accent);
  font-weight: 900;
}

.steps button.current {
  color: var(--text);
  border-color: var(--accent);
  background: rgba(255, 138, 42, 0.1);
  font-weight: 600;
}

.steps button.current .symbol {
  color: var(--accent);
}

.steps button:disabled {
  opacity: 0.4;
  cursor: default;
}

/* Phones: the step's bar in place of the pills. */
.step-nav {
  display: none;
}

@media (max-width: 760px) {
  .steps-row {
    display: none;
  }

  .step-nav {
    display: block;
  }
}
</style>
