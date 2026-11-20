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
} from './adjust.ts';
import {
  NO_CHOICE,
  choiceSettings,
  distanceRange,
  filterSettings,
  placeMissing,
  type Choice,
} from './choice.ts';
import ModalPanel from './components/ModalPanel.vue';
import type { EngineClient } from './engine-client.ts';
import { install, installOffer } from './install.ts';
import type { MadeVideo } from './made-video.ts';
import type { ActivitySummary, MatchReport, PlanReport } from './messages.ts';
import ActivitiesStep from './steps/ActivitiesStep.vue';
import AppearanceStep from './steps/AppearanceStep.vue';
import ExportStep from './steps/ExportStep.vue';
import ImportStep from './steps/ImportStep.vue';
import PlaybackStep from './steps/PlaybackStep.vue';
import { useStrava } from './use-strava.ts';

const props = defineProps<{ engine: EngineClient }>();

type Step = 'import' | 'activities' | 'playback' | 'appearance' | 'export';
const steps: { id: Step; label: string }[] = [
  { id: 'import', label: 'Source' },
  { id: 'activities', label: 'Activities' },
  { id: 'playback', label: 'Playback' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'export', label: 'Export' },
];
const stepIndex = computed(() => steps.findIndex((s) => s.id === step.value));

const unsupported = missingSupport();
const step = ref<Step>('import');
const loaded = ref(false);
const libraryError = ref('');
const library = ref<ActivitySummary[]>([]);
const fileAdjustments = ref<Adjustments>(loadAdjustments());
const stravaAdjustments = ref<Adjustments>({});
const fileChoice = ref<Choice>({ ...NO_CHOICE });
const fileMatches = ref<MatchReport>({ ids: [], problem: null });
const {
  active: strava,
  ready: stravaReady,
  busy: stravaBusy,
  choice: stravaChoice,
  error: stravaError,
  notice: stravaNotice,
  matched: stravaMatches,
  rows: stravaRows,
  url: stravaUrl,
  connect: connectStrava,
  end: endStrava,
  retry: retryStrava,
  prepare: prepareStrava,
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

const toast = ref('');
let toastTimer: ReturnType<typeof setTimeout> | undefined;

async function disconnectStrava(): Promise<void> {
  if (!(await endStrava(true))) return;
  toast.value = 'Strava disconnected and temporary activities cleared.';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 5000);
}

onBeforeUnmount(() => clearTimeout(toastTimer));

const choice = computed({
  get: () => (strava.value ? stravaChoice.value : fileChoice.value),
  set: (after: Choice) => {
    if (strava.value) stravaChoice.value = after;
    else fileChoice.value = after;
  },
});
const sourceRows = computed(() => (strava.value ? stravaRows.value : library.value));
const activityMatch = computed(() => (strava.value ? stravaMatches.value : fileMatches.value));
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
  get: () => (strava.value ? stravaAdjustments.value : fileAdjustments.value),
  set: (after: Adjustments) => {
    if (strava.value) stravaAdjustments.value = after;
    else fileAdjustments.value = after;
  },
});
watch(fileAdjustments, saveAdjustments);

/** The settings of the video: the chosen activities and the adjustments. */
const settings = computed<SettingsInput>(() => ({
  ...(strava.value
    ? { activity: chosenIds.value }
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
  [() => stepIndex.value >= 2, () => JSON.stringify(planningSettings.value), strava],
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
watch(library, () => (video.value = null));

/** Whether a step can be opened: later steps need activities, and a choice. */
function reachable(id: Step): boolean {
  if (id === 'import') return true;
  if (!strava.value && library.value.length === 0) return false;
  return (
    id === 'activities' || (chosenIds.value.length > 0 && !awaitingPlace.value && !stravaBusy.value)
  );
}

async function navigate(id: Step): Promise<void> {
  if (!reachable(id)) return;
  if (strava.value && step.value === 'activities' && id !== 'activities' && id !== 'import') {
    const ids = chosenIds.value.join(',');
    if (!(await prepareStrava(chosenIds.value))) return;
    if (step.value !== 'activities' || ids !== chosenIds.value.join(',')) return;
  }
  if (strava.value && step.value === 'import' && id !== 'activities' && id !== 'import') {
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

// Each step starts at the top of the page.
watch(step, () => window.scrollTo({ top: 0 }));

async function loadLibrary(): Promise<void> {
  libraryError.value = '';
  try {
    library.value = await props.engine.readLibrary();
    loaded.value = true;
    if (library.value.length > 0) step.value = 'activities';
    if (await connectStrava(fileAdjustments.value)) step.value = 'activities';
  } catch (error) {
    libraryError.value = error instanceof Error ? error.message : String(error);
  }
}

onMounted(() => {
  if (unsupported) return;
  void loadLibrary();
});

// Find what the filters match whenever they or the library change. A newer answer may
// arrive before an older one, so only the latest request's answer is kept.
let latest = 0;
const fileFilters = computed(() => filterSettings(fileChoice.value, new Date()));
watch(
  [() => JSON.stringify(fileFilters.value), library],
  async () => {
    const request = ++latest;
    fileMatches.value = { ids: [], problem: null };
    try {
      const result = await props.engine.match(fileFilters.value);
      if (request === latest) fileMatches.value = result;
    } catch (error) {
      if (request === latest)
        fileMatches.value = {
          ids: [],
          problem: error instanceof Error ? error.message : String(error),
        };
    }
  },
  { deep: true },
);
</script>

<template>
  <!-- The header and the step bar stay at the top of the window while a step scrolls. -->
  <div ref="topBar" class="top-bar">
    <header class="header">
      <span class="brand">
        <img class="mark" src="/icons/route.svg" alt="" />
        <span class="wordmark"><b>worn</b>ways</span>
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
      </span>
    </header>
    <nav v-if="!unsupported && loaded" class="steps-row" aria-label="Steps">
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
      <!-- Phones: which step of how many, over a bar with a segment per step. -->
      <div class="stepper">
        <div class="stepper-row">
          <strong>Step {{ stepIndex + 1 }} of {{ steps.length }}</strong>
          <span class="muted">{{ steps[stepIndex]?.label }}</span>
        </div>
        <div class="segments">
          <button
            v-for="(s, i) in steps"
            :key="s.id"
            type="button"
            :class="{ current: s.id === step, done: i < stepIndex }"
            :aria-label="`Go to ${s.label}`"
            :disabled="!reachable(s.id)"
            @click="navigate(s.id)"
          />
        </div>
      </div>
    </nav>
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
        :strava-url="stravaUrl"
        :strava-active="strava"
        :strava-error="stravaError"
        :strava-busy="stravaBusy"
        @changed="library = $event"
        @files="endStrava()"
        @disconnect="disconnectStrava"
        @next="navigate('activities')"
      />
      <ActivitiesStep
        v-else-if="step === 'activities'"
        v-model="choice"
        :engine="engine"
        :library="sourceRows"
        :matched="matched"
        :distance-scale="distanceScale"
        :strava="strava"
        :show-source="!!stravaUrl || strava"
        :busy="stravaBusy"
        :notice="stravaNotice"
        :can-retry="strava && (!stravaReady || sourceRows.length === 0)"
        @back="navigate('import')"
        @next="navigate('playback')"
        @retry="retryStrava()"
      />
      <PlaybackStep
        v-else-if="step === 'playback'"
        v-model="adjustments"
        :activities="chosenIds.length"
        :plan="plan"
        @back="step = 'activities'"
        @next="step = 'appearance'"
      />
      <AppearanceStep
        v-else-if="step === 'appearance'"
        v-model="adjustments"
        :engine="engine"
        :settings="settings"
        :activities="chosenIds.length"
        :plan="plan"
        @back="step = 'playback'"
        @next="step = 'export'"
      />
      <ExportStep
        v-else
        v-model:video="video"
        :engine="engine"
        :settings="settings"
        :plan="plan"
        :plan-error="planError"
        @back="step = 'appearance'"
      />
    </template>
  </main>

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
  align-items: center;
  gap: 0.55rem;
}

.mark {
  height: 1.3rem;
}

.aside {
  display: flex;
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

/* Phones: one row. The first step says that files stay on the device. */
@media (max-width: 560px) {
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

/* Phones: which step of how many, and a segment per step. */
.stepper {
  display: none;
}

@media (max-width: 700px) {
  .steps {
    display: none;
  }

  .stepper {
    display: block;
  }

  .stepper-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    font-size: 0.8rem;
  }

  .segments {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.3rem;
  }

  .segments button {
    height: 5px;
    padding: 0;
    border: 0;
    border-radius: 99px;
    background: var(--line);
  }

  .segments button.done {
    background: #a45b2e;
  }

  .segments button.current {
    background: var(--accent);
  }
}
</style>
