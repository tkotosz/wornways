<script setup lang="ts">
// The editor, the app's one screen: designing the video, in sections, in the order things are
// decided: the frame, how the routes play, the map, what is drawn over the replay, and how it
// ends. One preview stays in view while the sections change. Where things are arranged on
// the picture (Overlay, Ending), it opens on a still; Play shows the draft and Edit goes back.
// The sections are opened from the section bar, in any order.
// Wide screens: a screen that does not scroll, in three columns: the sections on a rail, the
// preview with the widgets' tools under it, and the section's settings, where a setting
// opened on its own, or a picked widget's settings, take their place.
// Phones: a screen that does not scroll, as photo and video editors are laid out, under the
// app's top bar: the preview takes most of it; under it, the open section's settings as one
// strip of chips that scrolls sideways, each opening its setting in a sheet; the sections
// along the bottom. Where widgets are arranged, the strip starts with adding them, and a
// picked widget turns it into that widget's options (WidgetStrip).
import {
  CARD_LAYOUT_NAMES,
  LAYOUTS,
  LAYOUT_NAMES,
  METRICS,
  TOTALS_FIELDS,
  parseWidgets,
  widgetsText,
  type ChartKind,
  type LayoutName,
  type Metric,
  type MetricValue,
  type SettingsInput,
  type Widget,
} from '@wornways/engine';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  SECTIONS,
  WIDGET_PART_NAMES,
  cardLayoutOf,
  countOf,
  layoutOf,
  widgetLabel,
  type Adjustments,
  type Section,
  type WidgetPart,
} from './adjust.ts';
import AddWidget from './components/AddWidget.vue';
import LayoutPicker from './components/LayoutPicker.vue';
import FramePanel from './components/FramePanel.vue';
import PlaybackPanel from './components/PlaybackPanel.vue';
import PosterPreview from './components/PosterPreview.vue';
import SettingSheet from './components/SettingSheet.vue';
import SectionIcon from './components/SectionIcon.vue';
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
  only?: WidgetPart;
} | null>(null);
function openSetting(name: string, label: string): void {
  sheet.value = { name, label };
}

// Overlay and Ending: widgets arranged on the still (WidgetEditor) and from the strip under it
// (WidgetStrip), over the replay or on the totals card; on wide screens also listed at the right.
/**
 * What the last still of the replay told: its widgets, the values the video can show and the
 * charts' shapes, for drawing the widgets over the bare still.
 */
const drawn = ref<{
  widgets: Widget[];
  values: Map<Metric, MetricValue>;
  profiles: Partial<Record<ChartKind, number[]>>;
} | null>(null);
/** What the still of the ending told of the totals card; null when the video has none. */
const drawnTotals = ref<{ widgets: Widget[]; values: Map<Metric, MetricValue> } | null>(null);
function onDrawn(poster: Poster, scene: PosterScene): void {
  drawn.value = {
    widgets: poster.widgets,
    values: new Map(poster.values),
    profiles: poster.profiles,
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
    return totals ? parseWidgets(set, TOTALS_FIELDS, { chart: false }) : parseWidgets(set, METRICS);
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
  const text = widgetsText(list, { card: board.value === 'totals' });
  adjustments.value = { ...adjustments.value, [widgetSetting.value]: text };
}

/** Opens a widget's settings in a sheet: all of them (the list), or one part of them. */
function openWidget(index: number, only?: WidgetPart): void {
  selectedWidget.value = index;
  const name = widgetLabel(widgets.value[index]!, values.value);
  const label = only ? `${name}: ${WIDGET_PART_NAMES[only].toLowerCase()}` : name;
  sheet.value = { name: 'widget', label, widget: index, ...(only ? { only } : {}) };
}

/**
 * Wide screens: a picked widget's settings, all of them, open beside the picture as soon as
 * it is picked, on the picture or in the list, and close when it is let go. After the change
 * is in, so a widget just added is in the list.
 */
watch(
  selectedWidget,
  (index) => {
    if (phone.value) return;
    if (index === null) {
      if (sheet.value?.name === 'widget') sheet.value = null;
    } else if (sheetWidget.value !== index && widgets.value[index]) openWidget(index);
  },
  { flush: 'post' },
);

/** A sheet closed. Wide screens: a widget's lets the widget go too. */
function closeSheet(): void {
  if (!phone.value && sheet.value?.name === 'widget') selectedWidget.value = null;
  sheet.value = null;
}

/** The widget a widget sheet is about. */
const sheetWidget = computed(() =>
  sheet.value?.name === 'widget' ? (sheet.value.widget ?? null) : null,
);

/**
 * Where a new widget goes: of a few spots clear of the middle, where Play sits, the one
 * furthest from the widgets already there; a chart goes along the bottom.
 */
function freeSpot(widget: Widget): Widget {
  // A chart goes along the bottom, above the charts already there.
  if (widget.kind === 'chart') {
    const below = widgets.value.filter((w) => w.kind === 'chart').length;
    return { ...widget, y: Math.max(20, widget.y - 9 * below) };
  }
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

/** The charts these activities can show, offered over the replay; none on the totals card. */
const charts = computed(() => (board.value === 'overlay' ? (props.plan?.charts ?? []) : []));

function useTool(tool: 'text' | 'values' | 'charts' | 'layout' | 'arrange' | 'guides'): void {
  if (tool === 'text') {
    // A new text, written straight away; left empty, it goes again.
    editingText.value = addWidget({ kind: 'text', text: '', x: 50, y: 50, size: 100 });
  } else if (tool === 'values') {
    sheet.value = { name: 'values', label: board.value === 'totals' ? 'Totals' : 'Stats' };
  } else if (tool === 'charts') sheet.value = { name: 'charts', label: 'Charts' };
  else if (tool === 'arrange') editor.value?.arrange();
  else if (tool === 'guides') adjustments.value = { ...adjustments.value, guides: !guides.value };
  else sheet.value = { name: 'layout', label: 'Layout' };
}

/**
 * The layout the board's widgets are arranged in, its slots shown as guides: over the replay
 * or on the totals card.
 */
const layout = computed<LayoutName>(() =>
  board.value === 'totals'
    ? cardLayoutOf(adjustments.value)
    : layoutOf(adjustments.value, countOf(props.activities)),
);
/** Whether the layout's slots show as guides while arranging; on until switched off. */
const guides = computed(() => adjustments.value['guides'] !== false);
/** The layouts the board can take, and the setting that holds the one picked. */
const layouts = computed(() => (board.value === 'totals' ? CARD_LAYOUT_NAMES : LAYOUT_NAMES));
const layoutSetting = computed(() => (board.value === 'totals' ? 'totals-layout' : 'layout'));
/** The picture's editor, which measures the widgets to arrange them. */
const editor = ref<InstanceType<typeof WidgetEditor> | null>(null);

/** Puts the widgets in the layout's slots, and closes its sheet. */
function arrangeInLayout(): void {
  editor.value?.arrange();
  sheet.value = null;
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
            ref="editor"
            v-model:selected="selectedWidget"
            :widgets="widgets"
            :values="values"
            :title="title"
            :profiles="drawn?.profiles ?? {}"
            :size="size"
            :card="board === 'totals'"
            :layout="layout"
            :guides="guides"
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
        :values="values"
        :charts="charts.length > 0"
        :layout="LAYOUTS[layout].name"
        :guides="guides"
        @done="selectedWidget = null"
        @tool="useTool"
        @edit="editingText = $event"
        @open="openWidget"
        @change="changeWidget"
        @remove="removeWidget"
      >
        <!-- Ending: the pause and the card's switch, then its tools, then the units and the
             end card. -->
        <template v-if="board === 'totals'" #before>
          <SettingsGroups
            v-model="adjustments"
            :groups="['pause', 'totals']"
            :count="countOf(activities)"
            view="rows"
            @open="openSetting"
          />
        </template>
        <SettingsGroups
          v-model="adjustments"
          :groups="board === 'totals' ? ['units', 'end-card'] : current.panels"
          :count="countOf(activities)"
          view="rows"
          @open="openSetting"
        />
      </WidgetStrip>
      <SettingsGroups
        v-else
        v-model="adjustments"
        :groups="current.panels"
        :count="countOf(activities)"
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
        <SectionIcon :section="s.id" />
        {{ s.label }}
      </button>
    </nav>
  </section>

  <!-- Wide screens: the sections on a rail at the left, the picture in the middle with the
       widgets' tools under it, and the open section's settings at the right; a setting opened
       on its own, or a picked widget's, takes their place. -->
  <section v-else class="studio">
    <h1 class="visually-hidden">Design your video</h1>
    <nav class="rail" aria-label="Sections">
      <button
        v-for="s in SECTIONS"
        :key="s.id"
        type="button"
        :aria-current="s.id === section ? 'step' : undefined"
        @click="open(s.id)"
      >
        <SectionIcon :section="s.id" />
        {{ s.label }}
      </button>
    </nav>

    <div class="stage">
      <PosterPreview
        class="picture"
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
            ref="editor"
            v-model:selected="selectedWidget"
            :widgets="widgets"
            :values="values"
            :title="title"
            :profiles="drawn?.profiles ?? {}"
            :size="size"
            :card="board === 'totals'"
            :layout="layout"
            :guides="guides"
            @change="setWidgets"
            @edit="editingText = $event"
          />
        </template>
      </PosterPreview>
      <!-- The widgets' tools under the picture; a picked widget's settings are at the right. -->
      <div v-if="board" class="setting-strip board-strip" role="region" aria-label="Widgets">
        <WidgetStrip
          :widgets="widgets"
          :selected="selectedWidget"
          :card="board === 'totals'"
          :values="values"
          :charts="charts.length > 0"
          :layout="LAYOUTS[layout].name"
          :guides="guides"
          beside
          @done="selectedWidget = null"
          @tool="useTool"
          @edit="editingText = $event"
          @open="openWidget"
          @change="changeWidget"
          @remove="removeWidget"
        />
      </div>
    </div>

    <aside class="inspector" :aria-label="`${current.label} settings`">
      <h2 class="inspector-title">{{ current.label }}</h2>
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
          :widgets="widgets"
          :values="values"
          :title="title"
          :selected="selectedWidget"
          @open="selectedWidget = $event"
        />
        <SettingsGroups
          v-model="adjustments"
          :groups="current.panels"
          :count="countOf(activities)"
        />
      </template>
    </aside>
  </section>

  <!-- A text widget's text, written over the whole screen. -->
  <TextEditor
    v-if="editingText !== null && widgets[editingText]?.kind === 'text'"
    :text="(widgets[editingText] as { text: string | null }).text ?? title"
    @done="writeText"
  />

  <!-- The setting being changed, on its own: from the phone's strip, or a widget's. Wide
       screens: in the place of the section's settings at the right, the picture still free. -->
  <SettingSheet v-if="sheet" :title="sheet.label" :docked="!phone" @close="closeSheet">
    <LayoutPicker
      v-if="sheet.name === 'layout'"
      :layout="layout"
      :names="layouts"
      @pick="adjustments = { ...adjustments, [layoutSetting]: $event }"
      @arrange="arrangeInLayout"
    />
    <AddWidget
      v-else-if="sheet.name === 'values' || sheet.name === 'charts'"
      :only="sheet.name"
      :widgets="widgets"
      :values="values"
      :charts="charts"
      :has-calories="!!plan?.hasCalories"
      @add="addWidget"
    />
    <WidgetSettings
      v-else-if="sheetWidget !== null && widgets[sheetWidget]"
      :widget="widgets[sheetWidget]!"
      :title="title"
      :values="values"
      :card="board === 'totals'"
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
      :only="sheet.name"
    />
  </SettingSheet>
</template>

<style scoped>
/* Wide screens: the window under the top bar, in three columns that each scroll by
   themselves: the sections, the picture with its tools, the settings. */
/* On a very wide window, no wider than --studio-width, in the middle, with a line each side,
   so the picture and its settings stay close. */
.studio {
  display: grid;
  flex: 1;
  grid-template-columns: 5.5rem minmax(0, 1fr) var(--inspector-width);
  box-sizing: border-box;
  width: 100%;
  max-width: var(--studio-width);
  min-height: 0;
  margin-inline: auto;
  border-inline: 1px solid var(--line);
}

.rail {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.9rem 0.5rem;
  border-right: 1px solid var(--line);
  overflow-y: auto;
}

.rail button {
  display: grid;
  justify-items: center;
  gap: 0.3rem;
  padding: 0.65rem 0;
  border: 0;
  border-radius: 10px;
  color: var(--muted);
  background: none;
  font: inherit;
  font-size: 0.75rem;
}

.rail button:hover {
  color: var(--text);
}

.rail button[aria-current] {
  color: var(--accent);
  background: rgb(255 138 42 / 10%);
  font-weight: 600;
}

/* The picture as large as the column allows, the tools under it. */
.studio .stage {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  min-width: 0;
  min-height: 0;
  padding: 1.2rem 1.5rem;
}

.studio .picture {
  flex: 1 1 0;
  height: auto;
  min-height: 0;
}

/* The tools in one row under the picture, sideways when they do not fit; as high whatever it
   holds, so the picture keeps its size when a widget is picked or let go. */
.board-strip {
  flex: none;
  align-items: center;
  justify-content: safe center;
  height: 3.6rem;
}

.inspector {
  min-height: 0;
  padding: 0 1.2rem 1.5rem;
  border-left: 1px solid var(--line);
  background: var(--panel);
  overflow-y: auto;
}

.inspector-title {
  margin: 0;
  padding: 1rem 0 0.3rem;
  font-size: 1.05rem;
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
