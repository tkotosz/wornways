<script setup lang="ts">
// The editor, the app's one screen: designing the video, in sections, in the order things are
// decided: the frame, how the routes play, the map, what is drawn over the replay, and how it
// ends. One preview stays in view while the sections change. Where things are arranged on
// the picture (Overlay, Ending), it opens on a still; Play shows the draft and Edit goes back.
// The sections are opened from the section bar, in any order.
// Wide screens: the section bar on top, the preview beside the settings; the page scrolls.
// Phones: a screen that does not scroll, as photo and video editors are laid out, under the
// app's top bar: the preview takes most of it; under it, the open section's settings as one
// strip of chips that scrolls sideways, each opening its setting in a sheet; the sections
// along the bottom. Where widgets are arranged, the strip starts with adding them, and a
// picked widget turns it into that widget's options (WidgetStrip); wide screens have that
// strip under the picture.
import {
  METRICS,
  TOTALS_FIELDS,
  parseWidgets,
  widgetsText,
  type Metric,
  type MetricValue,
  type SettingsInput,
  type Widget,
} from '@wornways/engine';
import { computed, onBeforeUnmount, ref } from 'vue';
import { SECTIONS, countOf, widgetLabel, type Adjustments, type Section } from './adjust.ts';
import AddWidget from './components/AddWidget.vue';
import FramePanel from './components/FramePanel.vue';
import PlaybackPanel from './components/PlaybackPanel.vue';
import PosterPreview from './components/PosterPreview.vue';
import SettingSheet from './components/SettingSheet.vue';
import SettingsGroups from './components/SettingsGroups.vue';
import TextEditor from './components/TextEditor.vue';
import WidgetEditor from './components/WidgetEditor.vue';
import WidgetList from './components/WidgetList.vue';
import WidgetSettings from './components/WidgetSettings.vue';
import WidgetStrip from './components/WidgetStrip.vue';
import type { EngineClient } from './engine-client.ts';
import type { PlanReport, Poster, PosterScene } from './messages.ts';

const props = defineProps<{
  engine: EngineClient;
  /** The settings of the whole video, for the preview. */
  settings: SettingsInput;
  activities: number;
  plan: PlanReport | null;
}>();
const adjustments = defineModel<Adjustments>({ required: true });
const section = defineModel<Section>('section', { required: true });

const current = computed(() => SECTIONS.find((s) => s.id === section.value)!);

/** Phones get the editor screen; the width matches the phone layout of the app's styles. */
const phoneQuery = window.matchMedia('(max-width: 760px)');
const phone = ref(phoneQuery.matches);
const onWidth = (event: MediaQueryListEvent) => (phone.value = event.matches);
phoneQuery.addEventListener('change', onWidth);
onBeforeUnmount(() => phoneQuery.removeEventListener('change', onWidth));

/** The phone's strip of settings, which scrolls by itself, sideways. */
const controls = ref<HTMLElement | null>(null);

function open(id: Section): void {
  section.value = id;
  sheet.value = null;
  selectedWidget.value = null;
  window.scrollTo({ top: 0 });
  controls.value?.scrollTo({ left: 0 });
}

// Phones: the section's settings as a strip of chips, each with its value; a chip opens its
// setting alone in a sheet.
const sheet = ref<{
  name: string;
  label: string;
  /** A widget's sheet: which widget, and only its size, label or format when a chip opened it. */
  widget?: number;
  only?: 'size' | 'label' | 'format';
} | null>(null);
function openSetting(name: string, label: string): void {
  sheet.value = { name, label };
}

// Overlay and Ending: widgets arranged on the still (WidgetEditor) and from the strip under it
// (WidgetStrip), over the replay or on the totals card; on wide screens also listed beside it.
/**
 * What the last still of the replay told: its widgets, the values the video can show and the
 * climb profile's shape, for drawing the widgets over the bare still.
 */
const drawn = ref<{
  widgets: Widget[];
  values: Map<Metric, MetricValue>;
  profile: number[] | null;
} | null>(null);
/** What the still of the ending told of the totals card; null when the video has none. */
const drawnTotals = ref<{ widgets: Widget[]; values: Map<Metric, MetricValue> } | null>(null);
function onDrawn(poster: Poster, scene: PosterScene): void {
  drawn.value = {
    widgets: poster.widgets,
    values: new Map(poster.values),
    profile: poster.profile,
  };
  if (scene === 'ending')
    drawnTotals.value = poster.totals
      ? { widgets: poster.totals.widgets, values: new Map(poster.totals.values) }
      : null;
}
/** Where the widgets being arranged are: over the replay, on the totals card, or nowhere. */
const board = computed<'overlay' | 'totals' | null>(() =>
  section.value === 'overlay'
    ? 'overlay'
    : section.value === 'ending' && drawnTotals.value
      ? 'totals'
      : null,
);
/** The setting that holds the widgets of the board. */
const widgetSetting = computed(() => (board.value === 'totals' ? 'totals-widgets' : 'widgets'));
/** The widgets as set, else the ones the still drew when none are. */
const widgets = computed<Widget[]>(() => {
  const totals = board.value === 'totals';
  const set = adjustments.value[widgetSetting.value];
  if (typeof set !== 'string')
    return (totals ? drawnTotals.value?.widgets : drawn.value?.widgets) ?? [];
  try {
    return totals
      ? parseWidgets(set, TOTALS_FIELDS, { chart: false, labels: false })
      : parseWidgets(set, METRICS);
  } catch {
    return [];
  }
});
const values = computed(
  () =>
    (board.value === 'totals' ? drawnTotals.value?.values : drawn.value?.values) ??
    new Map<Metric, MetricValue>(),
);
const title = computed(() => props.plan?.title ?? '');
/** The widget picked on the still or in the list. */
const selectedWidget = ref<number | null>(null);

function setWidgets(list: Widget[]): void {
  const text = widgetsText(list, { labels: board.value !== 'totals' });
  adjustments.value = { ...adjustments.value, [widgetSetting.value]: text };
}

/** Opens a widget's settings in a sheet: all of them (the list), or its size, label or format. */
function openWidget(index: number, only?: 'size' | 'label' | 'format'): void {
  selectedWidget.value = index;
  const name = widgetLabel(widgets.value[index]!, values.value);
  const label = only ? `${name}: ${only}` : name;
  sheet.value = { name: 'widget', label, widget: index, ...(only ? { only } : {}) };
}

/** The widget a widget sheet is about. */
const sheetWidget = computed(() =>
  sheet.value?.name === 'widget' ? (sheet.value.widget ?? null) : null,
);

/** Puts the widget in the middle across, where it is down. */
function centerWidget(index: number): void {
  const widget = widgets.value[index];
  if (widget) changeWidget(index, { ...widget, x: 50 });
}

/**
 * Where a new widget goes: of a few spots clear of the middle, where Play sits, the one
 * furthest from the widgets already there; the chart keeps its place near the bottom.
 */
function freeSpot(widget: Widget): Widget {
  if (widget.kind === 'elevation-chart') return widget;
  const spots = [
    { x: 50, y: 28 },
    { x: 50, y: 70 },
    { x: 30, y: 38 },
    { x: 70, y: 38 },
    { x: 30, y: 62 },
    { x: 70, y: 62 },
  ];
  const distance = (spot: { x: number; y: number }) =>
    Math.min(Infinity, ...widgets.value.map((w) => Math.hypot(w.x - spot.x, w.y - spot.y)));
  const best = spots.reduce((a, b) => (distance(b) > distance(a) ? b : a));
  return { ...widget, ...best };
}

/** Adds a widget, picked, and gives its place in the list. */
function addWidget(widget: Widget): number {
  // Its place now: the list read back would still be the one before, until the change is in.
  const index = widgets.value.length;
  setWidgets([...widgets.value, freeSpot(widget)]);
  selectedWidget.value = index;
  sheet.value = null;
  return index;
}

function changeWidget(index: number, widget: Widget): void {
  setWidgets(widgets.value.map((w, k) => (k === index ? widget : w)));
}

function removeWidget(index: number): void {
  setWidgets(widgets.value.filter((_, k) => k !== index));
  selectedWidget.value = null;
  sheet.value = null;
}

/** The text widget whose text is being written over the whole screen; null when none is. */
const editingText = ref<number | null>(null);

/** The text written: the widget takes it, or goes when it is left empty. */
function writeText(text: string): void {
  const index = editingText.value;
  editingText.value = null;
  if (index === null) return;
  const widget = widgets.value[index];
  if (!text) removeWidget(index);
  else if (widget?.kind === 'text') changeWidget(index, { ...widget, text });
}

/** The elevation chart in the strip: offered over the replay when an activity has heights. */
const chart = computed(() => ({
  offered: board.value === 'overlay' && !!props.plan?.hasElevation,
  shown: widgets.value.some((widget) => widget.kind === 'elevation-chart'),
}));

function useTool(tool: 'text' | 'values' | 'chart'): void {
  if (tool === 'text') {
    // A new text, written straight away; left empty, it goes again.
    editingText.value = addWidget({ kind: 'text', text: '', x: 50, y: 50, size: 100 });
  } else if (tool === 'values') {
    sheet.value = { name: 'values', label: board.value === 'totals' ? 'Totals' : 'Metrics' };
  } else {
    // A switch: the strip stays as it is, so the new chart is not picked.
    const at = widgets.value.findIndex((widget) => widget.kind === 'elevation-chart');
    if (at >= 0) removeWidget(at);
    else addWidget({ kind: 'elevation-chart', x: 50, y: 88, size: 100 });
    selectedWidget.value = null;
  }
}
</script>

<template>
  <!-- Phones: the editor screen. -->
  <section v-if="phone" class="editor">
    <h1 class="visually-hidden">Design your video</h1>
    <div class="stage">
      <PosterPreview
        :engine="engine"
        :settings="settings"
        :seconds="plan?.seconds"
        :scene="section === 'ending' ? 'ending' : 'replay'"
        :editing="section === 'overlay' || section === 'ending'"
        :hide-play="board !== null && selectedWidget !== null"
        :bare="section === 'overlay' || section === 'ending'"
        @drawn="onDrawn"
      >
        <template #layer="{ size }">
          <WidgetEditor
            v-if="board"
            v-model:selected="selectedWidget"
            :widgets="widgets"
            :values="values"
            :title="title"
            :profile="drawn?.profile ?? null"
            :size="size"
            :card="board === 'totals'"
            @change="setWidgets"
            @edit="editingText = $event"
          />
        </template>
      </PosterPreview>
    </div>

    <!-- The section's settings; where widgets are arranged, the tools for them first, or a
           picked widget's options. -->
    <div
      ref="controls"
      class="tools setting-strip"
      :aria-label="`${current.label} settings`"
      role="region"
    >
      <FramePanel
        v-if="section === 'frame'"
        v-model="adjustments"
        view="rows"
        @open="openSetting"
      />
      <PlaybackPanel
        v-else-if="section === 'playback'"
        v-model="adjustments"
        :activities="activities"
        :plan="plan"
        view="rows"
        @open="openSetting"
      />
      <WidgetStrip
        v-else-if="board"
        :widgets="widgets"
        :selected="selectedWidget"
        :card="board === 'totals'"
        :chart="chart"
        @done="selectedWidget = null"
        @tool="useTool"
        @edit="editingText = $event"
        @open="openWidget"
        @center="centerWidget"
        @remove="removeWidget"
      >
        <!-- Ending: the pause and the card's switch, then its tools, then the end card. -->
        <template v-if="board === 'totals'" #before>
          <SettingsGroups
            v-model="adjustments"
            :groups="['pause', 'totals']"
            :count="countOf(activities)"
            :plan="plan"
            view="rows"
            @open="openSetting"
          />
        </template>
        <SettingsGroups
          v-model="adjustments"
          :groups="board === 'totals' ? ['end-card'] : current.panels"
          :count="countOf(activities)"
          :plan="plan"
          view="rows"
          @open="openSetting"
        />
      </WidgetStrip>
      <SettingsGroups
        v-else
        v-model="adjustments"
        :groups="current.panels"
        :count="countOf(activities)"
        :plan="plan"
        view="rows"
        @open="openSetting"
      />
    </div>

    <nav class="sections" aria-label="Sections">
      <button
        v-for="s in SECTIONS"
        :key="s.id"
        type="button"
        :aria-current="s.id === section ? 'step' : undefined"
        @click="open(s.id)"
      >
        <!-- A line drawing for each: a phone's frame, play, a folded map, text on a
             picture, a finish flag. -->
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <template v-if="s.id === 'frame'">
            <rect x="7" y="3" width="10" height="18" rx="2" />
            <path d="M3 8v8M21 8v8" />
          </template>
          <template v-else-if="s.id === 'playback'">
            <circle cx="12" cy="12" r="9" />
            <path d="M10 8.5v7l6-3.5z" />
          </template>
          <template v-else-if="s.id === 'map'">
            <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
            <path d="M9 4v14M15 6v14" />
          </template>
          <template v-else-if="s.id === 'overlay'">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M7 8h7M7 16h4" />
          </template>
          <path v-else d="M5 21V4h11l-2 4 2 4H5" />
        </svg>
        {{ s.label }}
      </button>
    </nav>
  </section>

  <!-- Wide screens. -->
  <section v-else class="design">
    <!-- The section bar says where the person is; the heading is for screen readers. -->
    <h1 class="visually-hidden">Design your video</h1>
    <nav class="sections-bar" aria-label="Sections">
      <button
        v-for="s in SECTIONS"
        :key="s.id"
        type="button"
        class="chip"
        :aria-current="s.id === section ? 'step' : undefined"
        @click="open(s.id)"
      >
        {{ s.label }}
      </button>
    </nav>

    <div class="layout">
      <div class="stage" :class="{ 'with-strip': board }">
        <PosterPreview
          :engine="engine"
          :settings="settings"
          :seconds="plan?.seconds"
          :scene="section === 'ending' ? 'ending' : 'replay'"
          :editing="section === 'overlay' || section === 'ending'"
          :hide-play="board !== null && selectedWidget !== null"
          :bare="section === 'overlay' || section === 'ending'"
          @drawn="onDrawn"
        >
          <template #layer="{ size }">
            <WidgetEditor
              v-if="board"
              v-model:selected="selectedWidget"
              :widgets="widgets"
              :values="values"
              :title="title"
              :profile="drawn?.profile ?? null"
              :size="size"
              :card="board === 'totals'"
              @change="setWidgets"
              @edit="editingText = $event"
            />
          </template>
        </PosterPreview>
        <!-- Adding widgets, or the picked one's options, under the picture. -->
        <div v-if="board" class="setting-strip board-strip" role="region" aria-label="Widgets">
          <WidgetStrip
            :widgets="widgets"
            :selected="selectedWidget"
            :card="board === 'totals'"
            :chart="chart"
            @done="selectedWidget = null"
            @tool="useTool"
            @edit="editingText = $event"
            @open="openWidget"
            @center="centerWidget"
            @remove="removeWidget"
          />
        </div>
      </div>
      <div class="settings">
        <FramePanel v-if="section === 'frame'" v-model="adjustments" />
        <PlaybackPanel
          v-else-if="section === 'playback'"
          v-model="adjustments"
          :activities="activities"
          :plan="plan"
        />
        <template v-else>
          <WidgetList
            v-if="board"
            class="widget-panel"
            :widgets="widgets"
            :values="values"
            :title="title"
            :selected="selectedWidget"
            @add="sheet = { name: 'add-widget', label: 'Add a widget' }"
            @open="openWidget($event)"
          />
          <SettingsGroups
            v-model="adjustments"
            :groups="current.panels"
            :count="countOf(activities)"
            :plan="plan"
          />
        </template>
      </div>
    </div>
  </section>

  <!-- A text widget's text, written over the whole screen. -->
  <TextEditor
    v-if="editingText !== null && widgets[editingText]?.kind === 'text'"
    :text="(widgets[editingText] as { text: string | null }).text ?? title"
    @done="writeText"
  />

  <!-- The setting being changed, on its own: from the phone's list, or a widget's. -->
  <SettingSheet v-if="sheet" :title="sheet.label" @close="sheet = null">
    <AddWidget
      v-if="sheet.name === 'add-widget' || sheet.name === 'values'"
      :values-only="sheet.name === 'values'"
      :widgets="widgets"
      :values="values"
      :has-elevation="board === 'overlay' && !!plan?.hasElevation"
      :has-calories="!!plan?.hasCalories"
      :labels="board !== 'totals'"
      @add="addWidget"
    />
    <WidgetSettings
      v-else-if="sheetWidget !== null && widgets[sheetWidget]"
      :widget="widgets[sheetWidget]!"
      :title="title"
      :values="values"
      :labels="board !== 'totals'"
      :only="sheet.only"
      @change="changeWidget(sheetWidget, $event)"
      @remove="removeWidget(sheetWidget)"
    />
    <FramePanel v-else-if="section === 'frame'" v-model="adjustments" :only="sheet.name" />
    <PlaybackPanel
      v-else-if="section === 'playback'"
      v-model="adjustments"
      :activities="activities"
      :plan="plan"
      :only="sheet.name"
    />
    <SettingsGroups
      v-else
      v-model="adjustments"
      :groups="current.panels"
      :count="countOf(activities)"
      :plan="plan"
      :only="sheet.name"
    />
  </SettingSheet>
</template>

<style scoped>
/* Wide screens: the sections as a row of pills, the open one filled. */
.sections-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0 0 1.25rem;
}

.sections-bar .chip[aria-current='step'] {
  border-color: var(--accent);
  color: #1a110b;
  background: var(--accent);
}

/* The preview beside the settings, kept in view below the app's top bar while they scroll. */
.layout {
  display: grid;
  grid-template-columns: 17rem 1fr;
  gap: 1.5rem;
  align-items: start;
}

/* The picture as tall as fits under the top bar, with the sections bar, the preview's
   heading and caption and the widgets' strip (where there is one) in view. */
.layout .stage {
  --preview-height: calc(100dvh - var(--top-bar-height, 0px) - 13rem);

  position: sticky;
  top: calc(var(--top-bar-height, 0px) + 1.5rem);
  min-width: 0;
}

.layout .stage.with-strip {
  --preview-height: calc(100dvh - var(--top-bar-height, 0px) - 17rem);
}

/* Wide screens: the widgets' strip under the picture. */
.board-strip {
  margin-top: 0.6rem;
}

/* The widgets in a box like the settings panels. */
.widget-panel {
  padding: 0 1.2rem 0.6rem;
  border-radius: 14px;
  background: var(--panel);
}

.settings {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}

/* Phones: the rest of the screen under the app's top bar. */
.editor {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

/* The preview takes what the rest leaves. */
.editor .stage {
  flex: 1 1 0;
  min-height: 0;
  padding: 0.75rem;
}

/* The open section's settings: one strip of chips, under the picture. */
.tools {
  flex: none;
  padding: 0.1rem 0.75rem 0.6rem;
}

/* The sections along the bottom, where the thumb is. */
.sections {
  display: grid;
  flex: none;
  grid-template-columns: repeat(5, 1fr);
  padding-bottom: env(safe-area-inset-bottom);
  border-top: 1px solid var(--line);
  background: var(--background);
}

.sections button {
  display: grid;
  justify-items: center;
  gap: 0.2rem;
  padding: 0.5rem 0 0.55rem;
  border: 0;
  color: var(--muted);
  background: none;
  font: inherit;
  font-size: 0.7rem;
}

.sections svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sections button[aria-current] {
  color: var(--accent);
  font-weight: 600;
}
</style>
