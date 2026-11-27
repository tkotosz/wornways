<script setup lang="ts">
// The app: one screen, the editor, under a top bar. Everything set up around the video happens
// in popups over it: picking the source, connecting it, what it keeps on this device, choosing
// the activities, the preset, and making the video. On the way in, each leads to the next
// (flow.ts); after that, the top bar opens any of them. The app holds what they share: the
// library, the choice of activities and which activities that choice matches.
import { SETTINGS, type SettingsInput } from '@wornways/engine';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { missingSupport } from './browser-support.ts';
import {
  PRESET_LABELS,
  adjustSettings,
  countOf,
  loadAdjustments,
  presetOf,
  saveAdjustments,
  withoutWidgets,
  type ActivityCount,
  type Adjustments,
  type Section,
} from './adjust.ts';
import {
  ALL_ACTIVITIES,
  choiceSettings,
  distanceRange,
  placeMissing,
  placeSettings,
  type Choice,
} from './choice.ts';
import AppMenu from './components/AppMenu.vue';
import AppPopup from './components/AppPopup.vue';
import DownloadDialog from './components/DownloadDialog.vue';
import LoadingStatus from './components/LoadingStatus.vue';
import TopBar from './components/TopBar.vue';
import VideoEditor from './VideoEditor.vue';
import type { EngineClient } from './engine-client.ts';
import { afterSource, asksPreset, type Popup } from './flow.ts';
import { install, installOffer, showsAppleInstallHelp } from './install.ts';
import type { MadeVideo } from './made-video.ts';
import type { ActivitySummary, MatchReport, PlanReport, Source } from './messages.ts';
import ActivitiesPopup from './popups/ActivitiesPopup.vue';
import ConnectPopup from './popups/ConnectPopup.vue';
import PresetPopup from './popups/PresetPopup.vue';
import RenderPopup from './popups/RenderPopup.vue';
import SourcesPopup from './popups/SourcesPopup.vue';
import StorePopup from './popups/StorePopup.vue';
import { useBackGesture } from './use-back-gesture.ts';
import { useDemo } from './use-demo.ts';
import { useMatches } from './use-matches.ts';
import { useRideWithGps } from './use-ridewithgps.ts';
import { useStrava } from './use-strava.ts';

const props = defineProps<{ engine: EngineClient }>();

const unsupported = missingSupport();
const version = WORNWAYS_VERSION;
const loaded = ref(false);
const libraryError = ref('');
const library = ref<ActivitySummary[]>([]);
const fileAdjustments = ref<Adjustments>(loadAdjustments());
const stravaAdjustments = ref<Adjustments>({});
/** The key the files' choice is remembered under, for the next visit. */
const FILE_CHOICE = 'wornways-file-choice';

/** The choice of files made on an earlier visit; null when none is remembered. */
function rememberedFileChoice(): Choice | null {
  try {
    const saved = localStorage.getItem(FILE_CHOICE);
    return saved ? { ...ALL_ACTIVITIES, ...(JSON.parse(saved) as Partial<Choice>) } : null;
  } catch {
    return null;
  }
}

const savedFileChoice = rememberedFileChoice();
const fileChoice = ref<Choice>(savedFileChoice ?? { ...ALL_ACTIVITIES });
watch(fileChoice, (choice) => {
  try {
    localStorage.setItem(FILE_CHOICE, JSON.stringify(choice));
  } catch {
    // Remembering is optional when browser storage is blocked or full.
  }
});
const { matches: fileMatches, matching: fileMatching } = useMatches(
  props.engine,
  'files',
  fileChoice,
  library,
);

/** The popup open over the editor, if any. */
const popup = ref<Popup | null>(null);
/** The menu, over the editor or a popup. */
const menuOpen = ref(false);
/** A page opened from the menu, over everything. */
const page = ref<'about' | 'install' | null>(null);
/** The preset popup asked for a new selection, which closes only with a choice. */
const presetForced = ref(false);
/**
 * The kind of selection the editor is set up for: one activity or several; null until
 * activities are chosen. Remembered for each source for the next visit (the demo starts
 * fresh), so the preset is asked again only for a new kind of selection.
 */
const editedCount = ref<ActivityCount | null>(null);
const KIND = (source: Source) => `wornways-kind-${source}`;

function rememberedKind(source: Source): ActivityCount | null {
  if (source === 'demo') return null;
  try {
    const saved = localStorage.getItem(KIND(source));
    return saved === 'one' || saved === 'several' ? saved : null;
  } catch {
    return null;
  }
}

function rememberKind(source: Source, kind: ActivityCount): void {
  if (source === 'demo') return;
  try {
    localStorage.setItem(KIND(source), kind);
  } catch {
    // Remembering is optional when browser storage is blocked or full.
  }
}
/** Whether the activities were taken to the editor, with their tracks on this device. */
const selected = ref(false);
/** The editor's open section, kept while the app is open. */
const section = ref<Section>('frame');

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
  // The connection ended: Strava, while it is the source, needs connecting again.
  () => {
    video.value = null;
    stravaAdjustments.value = {};
    if (chosen.value === 'strava') {
      selected.value = false;
      popup.value = 'connect';
    }
  },
  // An activity changed on Strava: the activities are chosen again.
  () => {
    video.value = null;
    if (chosen.value === 'strava' && selected.value) {
      selected.value = false;
      popup.value = 'activities';
    }
  },
);

const rwgps = useRideWithGps(props.engine, () => {
  video.value = null;
  if (chosen.value === 'rwgps') {
    selected.value = false;
    popup.value = 'connect';
  }
});

// A short message over everything, popups too (the top layer, as a popover).
const toast = ref('');
const toastBox = ref<HTMLElement | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function showToast(text: string): void {
  toast.value = text;
  toastBox.value?.hidePopover?.();
  toastBox.value?.showPopover?.();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = '';
    toastBox.value?.hidePopover?.();
  }, 5000);
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

/** iPhone and iPad install only from Safari's Share menu; Install app explains how. */
const appleInstallHelp = showsAppleInstallHelp();

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

/** Whether this browser is connected to Strava, also while another source is chosen. */
const stravaConnected = computed(() => !!stravaUntil.value && stravaUntil.value > Date.now());

/** Where the activities come from: Strava, Ride with GPS or the demo while open, else this device. */
const source = computed<Source>(() =>
  strava.value ? 'strava' : rwgps.active.value ? 'rwgps' : demo.active.value ? 'demo' : 'files',
);
/** The tracks being downloaded before the activities go to the editor, if any. */
const download = computed(() =>
  source.value === 'strava'
    ? { service: 'Strava', progress: stravaDownload.value }
    : { service: 'Ride with GPS', progress: rwgps.download.value },
);
/** Whether a connected service is the source: its tracks are fetched before editing. */
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

/** Whether there is a video to edit: activities taken to the editor, and some still chosen. */
const editing = computed(() => selected.value && chosenIds.value.length > 0);
/** The editor shows, except while the activities it shows are being chosen again. */
const showsEditor = computed(() => editing.value && popup.value !== 'activities');
/** A popup closes once there is something to go back to, the preset only with a choice. */
const popupClosable = computed(
  () => editing.value && !(popup.value === 'preset' && presetForced.value),
);

// What was set in the editor, kept for the next visit.
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
  [showsEditor, () => JSON.stringify(planningSettings.value), source],
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

// The last video made, in memory only. It stays while what it shows stays the same, so Render
// shows it again; any change to the settings or the library discards it.
const video = ref<MadeVideo | null>(null);
watch(video, (_, before) => {
  if (before) URL.revokeObjectURL(before.url);
});
watch(settings, () => {
  if (video.value && video.value.settingsKey !== JSON.stringify(settings.value)) video.value = null;
});
watch([library, source], () => (video.value = null));

/** The top bar: the preset in use, and what the source keeps on this device. */
const presetName = computed(() =>
  editing.value
    ? PRESET_LABELS[presetOf(adjustments.value, countOf(chosenIds.value.length))]
    : null,
);
const store = computed(() => {
  if (chosen.value === 'files') return { label: 'Files on this device', caption: 'Files' };
  if (chosen.value === 'strava' && stravaConnected.value)
    return { label: 'Strava connection', caption: 'Connection' };
  if (chosen.value === 'rwgps' && rwgps.connected.value)
    return { label: 'Ride with GPS connection', caption: 'Connection' };
  return null;
});

// The choice as it was when the activities popup opened: closing it without taking the
// activities to the editor puts it back, also from what the source keeps, opened from it.
let choiceBefore: Choice | null = null;
/** What the source keeps was opened from the activities popup, and goes back to it. */
const storeFromActivities = ref(false);
watch(popup, (now, before) => {
  if (now === 'activities' && before !== 'store')
    choiceBefore = editing.value ? choice.value : null;
  else if (now !== 'activities' && now !== 'store') choiceBefore = null;
  if (now !== 'store') storeFromActivities.value = false;
});

function openStore(fromActivities: boolean): void {
  popup.value = 'store';
  storeFromActivities.value = fromActivities;
}

/** Closes the popup, when it can close: the editor is as it was. */
function closePopup(): void {
  if (!popupClosable.value) return;
  if (choiceBefore) choice.value = choiceBefore;
  popup.value = null;
}

// The back gesture closes the menu's page, the menu, then the popup.
const layers = computed(
  () => (popup.value ? 1 : 0) + (menuOpen.value ? 1 : 0) + (page.value ? 1 : 0),
);
useBackGesture(layers, () => {
  if (page.value) page.value = null;
  else if (menuOpen.value) menuOpen.value = false;
  else closePopup();
});

/** Lets go of every source but the one given: they are never mixed. */
async function release(keep: Source | null): Promise<void> {
  // Strava's connection stays for its two hours, as Ride with GPS's does for its 30 days.
  if (keep !== 'strava') await closeStrava();
  if (keep !== 'rwgps') await rwgps.close();
  if (keep !== 'demo') await demo.close();
}

/**
 * Opens the chosen source, and the popup it needs next: connecting it, adding files, or
 * choosing the activities. Strava and Ride with GPS open from what is stored in this browser;
 * a connection that ended asks to connect again.
 */
async function enterSource(): Promise<void> {
  const id = chosen.value;
  if (!id) {
    popup.value = 'source';
    return;
  }
  editedCount.value = rememberedKind(id);
  if (id === 'demo' && !demo.active.value && !(await demo.open())) {
    popup.value = 'source';
    return;
  }
  if (id === 'strava' && !strava.value) await connectStrava(fileAdjustments.value);
  if (id === 'rwgps' && !rwgps.active.value && rwgps.connected.value) {
    // Its trips load in the activities popup; a connection no longer accepted asks again.
    popup.value = 'activities';
    if (!(await rwgps.open())) popup.value = 'connect';
    return;
  }
  popup.value = afterSource(id, {
    connected: id === 'strava' ? strava.value : rwgps.active.value,
    files: library.value.length,
  });
}

/** A source picked: the same one goes straight to its activities, another one starts over. */
async function choose(id: Source): Promise<void> {
  if (id === chosen.value && editing.value) {
    popup.value = 'activities';
    return;
  }
  chosen.value = id;
  selected.value = false;
  await release(id);
  await enterSource();
}

/**
 * The activities ticked go to the editor, once their tracks are on this device. The preset
 * is asked when the editor was not set up for this kind of selection yet.
 */
async function useActivities(): Promise<void> {
  if (remote.value) {
    const ids = chosenIds.value.join(',');
    const prepare = strava.value ? prepareStrava : rwgps.prepare;
    if (!(await prepare(chosenIds.value))) return;
    if (popup.value !== 'activities' || ids !== chosenIds.value.join(',')) return;
  }
  const kind = countOf(chosenIds.value.length);
  const ask = asksPreset(editedCount.value, kind);
  // A change of kind without asking (to one activity, which has a single preset): its preset
  // is taken as picked, and the widgets start again from the ones that suit it. The first
  // selection of a visit keeps the widgets arranged before.
  if (!ask && editedCount.value !== null && editedCount.value !== kind)
    adjustments.value = withoutWidgets(adjustments.value);
  editedCount.value = kind;
  rememberKind(source.value, kind);
  selected.value = true;
  presetForced.value = ask;
  popup.value = ask ? 'preset' : null;
}

function presetChosen(): void {
  presetForced.value = false;
  popup.value = null;
}

function openPreset(): void {
  presetForced.value = false;
  popup.value = 'preset';
}

/** Switch source, from the menu: the list of sources takes the menu's place. */
function switchSource(): void {
  menuOpen.value = false;
  popup.value = 'source';
}

function openPage(name: 'about' | 'install'): void {
  menuOpen.value = false;
  if (name === 'install' && installOffer.value) void install();
  else page.value = name;
}

// The top bar's height, for the editor's preview on wide screens, which stays under it.
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

/**
 * On a visit with files and the choice made last time, its activities go straight to the
 * editor once they are matched, without asking anything again.
 */
let resuming = savedFileChoice !== null;
watch([popup, matching], () => {
  if (!resuming || popup.value !== 'activities' || matching.value) return;
  resuming = false;
  if (source.value === 'files' && chosenIds.value.length && !awaitingPlace.value)
    void useActivities();
});

async function loadLibrary(): Promise<void> {
  libraryError.value = '';
  try {
    library.value = await props.engine.readLibrary();
    loaded.value = true;
    const [rwgpsJustConnected, stravaKept] = await Promise.all([rwgps.check(), stravaStatus()]);
    // Coming back from connecting a service chooses it.
    if (rwgpsJustConnected) chosen.value = 'rwgps';
    else if (stravaReturning) chosen.value = 'strava';
    // Only the chosen source opens; the other connections stay as they are.
    if (chosen.value !== 'strava' && stravaKept)
      await props.engine.keepStrava(stravaKept).catch(() => {});
    if (chosen.value !== 'files') resuming = false;
    await enterSource();
    // Only straight from the start: files to add first, say, are a visit of their own.
    if (popup.value !== 'activities') resuming = false;
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
  <div class="app" :class="{ editing: showsEditor }">
    <div ref="topBar" class="bar">
      <TopBar
        :source="chosen"
        :activities="editing ? chosenIds.length : null"
        :store="store"
        :preset="presetName"
        :can-render="editing"
        @menu="menuOpen = true"
        @switch="popup = 'source'"
        @activities="popup = 'activities'"
        @store="openStore(false)"
        @preset="openPreset"
        @render="popup = 'render'"
      />
    </div>

    <main class="main">
      <p v-if="unsupported" class="error" role="alert">{{ unsupported }}</p>
      <div v-else-if="libraryError">
        <p class="error" role="alert">{{ libraryError }}</p>
        <button type="button" class="secondary" @click="loadLibrary">Try again</button>
      </div>
      <VideoEditor
        v-else-if="showsEditor"
        v-model="adjustments"
        v-model:section="section"
        :engine="engine"
        :settings="settings"
        :activities="chosenIds.length"
        :plan="plan"
      />
      <LoadingStatus
        v-else-if="!loaded || (!popup && stravaBusy)"
        :text="stravaBusy || 'Loading…'"
      />
      <p v-else class="muted empty">Choose activities to make a video of them.</p>
    </main>
  </div>

  <template v-if="loaded">
    <SourcesPopup
      v-if="popup === 'source'"
      :engine="engine"
      :closable="popupClosable"
      :chosen="chosen"
      :files="library.length"
      :strava="{ offered: !!stravaUrl, until: stravaUntil }"
      :rwgps="{ available: rwgps.available.value, connected: rwgps.connected.value }"
      :busy="demo.busy.value"
      :error="demo.error.value || rwgps.error.value"
      @close="closePopup"
      @menu="menuOpen = true"
      @choose="choose"
    />
    <ConnectPopup
      v-else-if="popup === 'connect' && (chosen === 'strava' || chosen === 'rwgps')"
      :source="chosen"
      :closable="popupClosable"
      :strava-url="stravaUrl"
      :strava-unanswered="stravaUnanswered"
      :busy="chosen === 'strava' ? stravaBusy : rwgps.busy.value"
      :error="chosen === 'strava' ? stravaError : rwgps.error.value"
      @close="closePopup"
      @menu="menuOpen = true"
      @switch="popup = 'source'"
      @files="choose('files')"
    />
    <StorePopup
      v-else-if="
        popup === 'store' && (chosen === 'files' || chosen === 'strava' || chosen === 'rwgps')
      "
      :engine="engine"
      :source="chosen"
      :closable="popupClosable"
      :flow="!editing || storeFromActivities"
      :library="library"
      :strava-until="stravaUntil"
      :busy="chosen === 'strava' ? stravaBusy : chosen === 'rwgps' ? rwgps.busy.value : ''"
      @close="closePopup"
      @menu="menuOpen = true"
      @next="popup = 'activities'"
      @changed="library = $event"
      @disconnect="chosen === 'strava' ? disconnectStrava() : disconnectRideWithGps()"
    />
    <ActivitiesPopup
      v-else-if="popup === 'activities'"
      v-model="choice"
      :engine="engine"
      :closable="popupClosable"
      :library="sourceRows"
      :matched="matched"
      :distance-scale="distanceScale"
      :strava="strava"
      :source="source"
      :busy="source === 'rwgps' ? rwgps.busy.value : stravaBusy"
      :matching="matching"
      :notice="source === 'rwgps' ? rwgps.notice.value : stravaNotice"
      :can-retry="strava && (!stravaReady || sourceRows.length === 0)"
      :manage="store ? (chosen === 'files' ? 'Manage files' : 'Manage connection') : null"
      @close="closePopup"
      @menu="menuOpen = true"
      @switch="popup = 'source'"
      @store="openStore(true)"
      @next="useActivities"
      @retry="retryStrava()"
    />
    <PresetPopup
      v-else-if="popup === 'preset' && editing"
      v-model="adjustments"
      :activities="chosenIds.length"
      :closable="popupClosable"
      @chosen="presetChosen"
      @close="closePopup"
      @menu="menuOpen = true"
    />
    <RenderPopup
      v-else-if="popup === 'render' && editing"
      v-model:video="video"
      :engine="engine"
      :settings="settings"
      :plan="plan"
      :plan-error="planError"
      @close="closePopup"
    />
  </template>

  <AppMenu
    v-if="menuOpen"
    :version="version"
    :source="chosen"
    :install="!!installOffer || appleInstallHelp"
    :source-in-bar="popup === null"
    @close="menuOpen = false"
    @source="switchSource"
    @about="openPage('about')"
    @install="openPage('install')"
  />

  <AppPopup
    v-if="page === 'about'"
    title="About Wornways"
    :closable="true"
    narrow
    @close="page = null"
  >
    <p class="about-copy">
      Wornways turns GPS activities into short videos that show your routes on a map. It makes
      videos in your browser. Activities you import from files stay on this device.
    </p>
    <p class="about-copy">Wornways is open source under the MIT License.</p>
    <nav class="about-links" aria-label="Project links">
      <a class="link" href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>
      <a class="link" href="https://github.com/tkotosz/wornways" target="_blank" rel="noopener">
        Source on GitHub
      </a>
      <a class="link" href="/licenses.txt" target="_blank" rel="noopener">Licenses</a>
    </nav>
  </AppPopup>
  <AppPopup
    v-else-if="page === 'install'"
    title="Install Wornways"
    :closable="true"
    narrow
    @close="page = null"
  >
    <ol class="install-steps">
      <li>Tap <b>Share</b> (the square with an arrow) in the browser's toolbar.</li>
      <li>
        Choose <b>Add to Home Screen</b>. You may need to scroll down, or tap <b>More</b>, to see
        it.
      </li>
      <li>Tap <b>Add</b>. Wornways then opens from your Home Screen like an app.</li>
    </ol>
  </AppPopup>

  <DownloadDialog
    v-if="download.progress"
    :service="download.service"
    :progress="download.progress"
  />

  <div ref="toastBox" class="toast-region" popover="manual" aria-live="polite" aria-atomic="true">
    <p v-if="toast" class="toast">{{ toast }}</p>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

/* The top bar stays at the top of the window while the editor's page scrolls. */
.bar {
  position: sticky;
  top: 0;
  z-index: 10;
}

.main {
  box-sizing: border-box;
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
  padding: 1.5rem;
}

.empty {
  margin: 3rem 0;
  text-align: center;
}

/* The editor is a screen that does not scroll; the top bar and it share the window. */
.app.editing {
  height: 100dvh;
  overflow: hidden;
}

.app.editing .main {
  display: flex;
  flex: 1;
  flex-direction: column;
  max-width: none;
  min-height: 0;
  padding: 0;
}

.about-copy {
  margin: 0 0 0.85rem;
  line-height: 1.55;
}

.about-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.15rem;
}

.install-steps {
  display: grid;
  gap: 0.6rem;
  margin: 0;
  padding-left: 1.3rem;
  line-height: 1.5;
}

/* The toast: a popover in the top layer, over popups too, at the top right. */
.toast-region {
  inset: auto;
  top: calc(var(--top-bar-height, 0px) + 1rem);
  right: 1rem;
  left: auto;
  max-width: min(24rem, calc(100% - 2rem));
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  pointer-events: none;
}

.toast {
  margin: 0;
  padding: 0.75rem 1rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--text);
  background: var(--panel);
  box-shadow: 0 6px 20px rgb(0 0 0 / 40%);
  font-size: 0.85rem;
  line-height: 1.4;
}
</style>
