<script setup lang="ts">
// The app's frame: the header, the step bar and the current step. It holds what the steps
// share: the library, the choice of activities, and which activities that choice matches.
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
  filterSettings,
  placeMissing,
  periodRange,
  type Choice,
} from './choice.ts';
import type { EngineClient } from './engine-client.ts';
import { install, installOffer } from './install.ts';
import type { MadeVideo } from './made-video.ts';
import type { ActivitySummary, MatchReport } from './messages.ts';
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
const library = ref<ActivitySummary[]>([]);
const fileChoice = ref<Choice>({ ...NO_CHOICE });
const fileMatches = ref<MatchReport>({ ids: [], problem: null });
const {
  active: strava,
  busy: stravaBusy,
  hasCallback: stravaCallback,
  choice: stravaChoice,
  error: stravaError,
  notice: stravaNotice,
  matched: stravaMatches,
  rows: stravaRows,
  url: stravaUrl,
  connect: connectStrava,
  configure: configureStrava,
  end: endStrava,
  list: listStrava,
  prepare: prepareStrava,
} = useStrava(props.engine, () => {
  step.value = 'import';
  video.value = null;
  stravaAdjustments.value = {};
});
const choice = computed({
  get: () => (strava.value ? stravaChoice.value : fileChoice.value),
  set: (after: Choice) => {
    if (strava.value) stravaChoice.value = after;
    else fileChoice.value = after;
  },
});
const sourceRows = computed(() => (strava.value ? stravaRows.value : library.value));
const matched = computed(() => (strava.value ? stravaMatches.value : fileMatches.value));

const chosenIds = computed(() =>
  matched.value.ids.filter((id) => !choice.value.excluded.includes(id)),
);
const chosenKm = computed(() => {
  const ids = new Set(chosenIds.value);
  return sourceRows.value.reduce((sum, a) => (ids.has(a.id) ? sum + a.distanceM : sum), 0);
});
/** The chosen activities in date order. */
const chosen = computed(() => {
  const ids = new Set(chosenIds.value);
  return sourceRows.value.filter((a) => ids.has(a.id)).sort((a, b) => a.startTime - b.startTime);
});
const period = computed(() => periodRange(choice.value, new Date()) ?? { from: null, to: null });

// What was set in the Video and Text steps, kept for the next visit.
const fileAdjustments = ref<Adjustments>(loadAdjustments());
const stravaAdjustments = ref<Adjustments>({});
const adjustments = computed({
  get: () => (strava.value ? stravaAdjustments.value : fileAdjustments.value),
  set: (after: Adjustments) => {
    if (strava.value) stravaAdjustments.value = after;
    else fileAdjustments.value = after;
  },
});
watch(fileAdjustments, saveAdjustments);

/** The settings of the video: the chosen activities and the adjustments. */
const settings = computed(() => ({
  ...(strava.value
    ? { activity: chosenIds.value.join(',') }
    : choiceSettings(choice.value, matched.value.ids, new Date())),
  ...adjustSettings(adjustments.value, countOf(chosenIds.value.length)),
}));

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
    id === 'activities' ||
    (chosenIds.value.length > 0 && !placeMissing(choice.value) && !stravaBusy.value)
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

onMounted(async () => {
  if (unsupported) return;
  void configureStrava();
  library.value = await props.engine.readLibrary();
  loaded.value = true;
  if (stravaCallback) {
    if (await connectStrava()) {
      stravaAdjustments.value = { ...fileAdjustments.value };
      step.value = 'activities';
    }
  } else if (library.value.length > 0) step.value = 'activities';
});

// Find what the filters match whenever they or the library change. A newer answer may
// arrive before an older one, so only the latest request's answer is kept.
let latest = 0;
watch(
  [() => filterSettings(fileChoice.value, new Date()), library],
  async ([filters]) => {
    const request = ++latest;
    try {
      const result = await props.engine.match(filters);
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
    <template v-else-if="loaded">
      <ImportStep
        v-if="step === 'import'"
        :engine="engine"
        :library="library"
        :strava-url="stravaUrl"
        :strava-active="strava"
        :strava-error="stravaError"
        :strava-busy="stravaBusy"
        :strava-notice="stravaNotice"
        @changed="library = $event"
        @files="endStrava()"
        @disconnect="endStrava(true)"
        @next="navigate('activities')"
      />
      <ActivitiesStep
        v-else-if="step === 'activities'"
        v-model="choice"
        :engine="engine"
        :library="sourceRows"
        :matched="matched"
        :strava="strava"
        :show-source="!!stravaUrl || strava"
        :busy="stravaBusy"
        :notice="stravaNotice"
        @back="navigate('import')"
        @next="navigate('playback')"
        @cancel="endStrava()"
        @retry="listStrava()"
      />
      <PlaybackStep
        v-else-if="step === 'playback'"
        v-model="adjustments"
        :engine="engine"
        :settings="settings"
        :chosen="chosen"
        :period="period"
        @back="step = 'activities'"
        @next="step = 'appearance'"
      />
      <AppearanceStep
        v-else-if="step === 'appearance'"
        v-model="adjustments"
        :engine="engine"
        :settings="settings"
        :chosen="chosen"
        :period="period"
        @back="step = 'playback'"
        @next="step = 'export'"
      />
      <ExportStep
        v-else
        v-model:video="video"
        :engine="engine"
        :settings="settings"
        :activities="chosenIds.length"
        :meters="chosenKm"
        :strava="strava"
        @back="step = 'appearance'"
        @done="endStrava()"
      />
    </template>
  </main>
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
