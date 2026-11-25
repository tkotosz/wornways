<script setup lang="ts">
// Step 3: designing the video, in sections, in the order things are decided: the frame, how
// the routes play, the map, what is drawn over the replay, and how it ends. One preview stays
// in view while the sections change. Where things are arranged on the picture (Overlay,
// Ending), it opens on a still; Play shows the draft and Edit goes back.
//
// The sections are opened from the section bar, in any order; the buttons to the steps
// before and after (StepNav, StepBar) leave the step, as on every step.
// Wide screens: the section bar on top, the preview beside the settings; the page scrolls.
// Phones: a full editor screen that does not scroll, as photo and video editors are laid
// out: the step bar on top; the preview takes most of the screen; under it, the open
// section's settings as a list in a panel of fixed height, each row opening its setting in a
// sheet; the sections along the bottom.
import {
  METRICS,
  parseWidgets,
  widgetsText,
  type Metric,
  type MetricValue,
  type SettingsInput,
  type Widget,
} from '@wornways/engine';
import { computed, onBeforeUnmount, ref } from 'vue';
import { SECTIONS, countOf, widgetLabel, type Adjustments, type Section } from '../adjust.ts';
import AddWidget from '../components/AddWidget.vue';
import FramePanel from '../components/FramePanel.vue';
import PlaybackPanel from '../components/PlaybackPanel.vue';
import PosterPreview from '../components/PosterPreview.vue';
import SettingSheet from '../components/SettingSheet.vue';
import StyleChooser from '../components/StyleChooser.vue';
import SettingsGroups from '../components/SettingsGroups.vue';
import StepBar from '../components/StepBar.vue';
import StepNav from '../components/StepNav.vue';
import WidgetEditor from '../components/WidgetEditor.vue';
import WidgetList from '../components/WidgetList.vue';
import WidgetSettings from '../components/WidgetSettings.vue';
import type { EngineClient } from '../engine-client.ts';
import type { PlanReport, Poster } from '../messages.ts';

const props = defineProps<{
  engine: EngineClient;
  /** The settings of the whole video, for the preview. */
  settings: SettingsInput;
  activities: number;
  plan: PlanReport | null;
}>();
const adjustments = defineModel<Adjustments>({ required: true });
const section = defineModel<Section>('section', { required: true });
/** Whether the style is asked first, as it is each time the step is opened from Activities. */
const choosing = defineModel<boolean>('choosing', { required: true });
const emit = defineEmits<{ back: []; next: [] }>();

const current = computed(() => SECTIONS.find((s) => s.id === section.value)!);

/** Phones get the editor screen; the width matches the phone layout of the app's styles. */
const phoneQuery = window.matchMedia('(max-width: 760px)');
const phone = ref(phoneQuery.matches);
const onWidth = (event: MediaQueryListEvent) => (phone.value = event.matches);
phoneQuery.addEventListener('change', onWidth);
onBeforeUnmount(() => phoneQuery.removeEventListener('change', onWidth));

/** A style picked: the editor opens, on the section open last (Frame at first). */
function chosen(): void {
  choosing.value = false;
}

/** The phone's list of settings, which scrolls by itself. */
const controls = ref<HTMLElement | null>(null);

function open(id: Section): void {
  section.value = id;
  sheet.value = null;
  window.scrollTo({ top: 0 });
  controls.value?.scrollTo({ top: 0 });
}

// Phones: the section's settings as a list, a row each with its value; a row opens its
// setting alone in a sheet over the list.
const sheet = ref<{ name: string; label: string } | null>(null);
function openSetting(name: string, label: string): void {
  sheet.value = { name, label };
}

// Overlay: the widgets, arranged on the still (WidgetEditor) and listed under it.
/** What the last still of the replay drew: its widgets and the values the video can show. */
const drawn = ref<{ widgets: Widget[]; values: Map<Metric, MetricValue> } | null>(null);
function onDrawn(poster: Poster): void {
  drawn.value = { widgets: poster.widgets, values: new Map(poster.values) };
}
/** The widgets as set, else the ones the still drew from the title and metrics settings. */
const widgets = computed<Widget[]>(() => {
  const set = adjustments.value['widgets'];
  if (typeof set !== 'string') return drawn.value?.widgets ?? [];
  try {
    return parseWidgets(set, METRICS);
  } catch {
    return [];
  }
});
const values = computed(() => drawn.value?.values ?? new Map<Metric, MetricValue>());
const title = computed(() => props.plan?.title ?? '');
/** The widget picked on the still or in the list. */
const selectedWidget = ref<number | null>(null);

function setWidgets(list: Widget[]): void {
  adjustments.value = { ...adjustments.value, widgets: widgetsText(list) };
}

function openWidget(index: number): void {
  selectedWidget.value = index;
  sheet.value = { name: `widget:${index}`, label: widgetLabel(widgets.value[index]!) };
}

/** The widget a widget sheet is about. */
const sheetWidget = computed(() =>
  sheet.value?.name.startsWith('widget:') ? Number(sheet.value.name.slice(7)) : null,
);

function addWidget(widget: Widget): void {
  setWidgets([...widgets.value, widget]);
  selectedWidget.value = widgets.value.length - 1;
  sheet.value = null;
}

function changeWidget(index: number, widget: Widget): void {
  setWidgets(widgets.value.map((w, k) => (k === index ? widget : w)));
}

function removeWidget(index: number): void {
  setWidgets(widgets.value.filter((_, k) => k !== index));
  selectedWidget.value = null;
  sheet.value = null;
}
</script>

<template>
  <!-- Phones: the editor screen. -->
  <section v-if="phone" class="editor">
    <h1 class="visually-hidden">Design your video</h1>
    <header class="top">
      <StepBar step="design" :next-disabled="choosing" @back="emit('back')" @next="emit('next')" />
    </header>

    <!-- Coming from Activities: how it plays, before the editor. -->
    <div v-if="choosing" class="choosing">
      <StyleChooser v-model="adjustments" :activities="activities" :plan="plan" @chosen="chosen" />
    </div>
    <template v-else>
      <div class="stage">
        <PosterPreview
          :engine="engine"
          :settings="settings"
          :seconds="plan?.seconds"
          :scene="section === 'ending' ? 'ending' : 'replay'"
          :editing="section === 'overlay' || section === 'ending'"
          @drawn="onDrawn"
        >
          <template #layer="{ boxes, ratio, placed }">
            <WidgetEditor
              v-if="section === 'overlay'"
              v-model:selected="selectedWidget"
              :widgets="widgets"
              :boxes="boxes.widgets"
              :ratio="ratio"
              @change="setWidgets"
              @placed="placed"
              @edit="openWidget"
            />
          </template>
        </PosterPreview>
      </div>

      <div ref="controls" class="tools" :aria-label="`${current.label} settings`" role="region">
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
        <WidgetList
          v-if="section === 'overlay'"
          :widgets="widgets"
          :values="values"
          :title="title"
          :selected="selectedWidget"
          @add="sheet = { name: 'add-widget', label: 'Add a widget' }"
          @open="openWidget"
        />
        <SettingsGroups
          v-if="section !== 'frame' && section !== 'playback'"
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
    </template>
  </section>

  <!-- Wide screens. -->
  <section v-else class="design">
    <!-- The section bar says where the person is; the heading is for screen readers. -->
    <h1 class="visually-hidden">Design your video</h1>
    <StyleChooser
      v-if="choosing"
      v-model="adjustments"
      :activities="activities"
      :plan="plan"
      @chosen="chosen"
    />
    <template v-else>
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
        <div class="stage">
          <PosterPreview
            :engine="engine"
            :settings="settings"
            :seconds="plan?.seconds"
            :scene="section === 'ending' ? 'ending' : 'replay'"
            :editing="section === 'overlay' || section === 'ending'"
            @drawn="onDrawn"
          >
            <template #layer="{ boxes, ratio, placed }">
              <WidgetEditor
                v-if="section === 'overlay'"
                v-model:selected="selectedWidget"
                :widgets="widgets"
                :boxes="boxes.widgets"
                :ratio="ratio"
                @change="setWidgets"
                @placed="placed"
                @edit="openWidget"
              />
            </template>
          </PosterPreview>
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
              v-if="section === 'overlay'"
              class="widget-panel"
              :widgets="widgets"
              :values="values"
              :title="title"
              :selected="selectedWidget"
              @add="sheet = { name: 'add-widget', label: 'Add a widget' }"
              @open="openWidget"
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
    </template>

    <StepNav step="design" :next-disabled="choosing" @back="emit('back')" @next="emit('next')" />
  </section>

  <!-- The setting being changed, on its own: from the phone's list, or a widget's. -->
  <SettingSheet v-if="sheet" :title="sheet.label" @close="sheet = null">
    <AddWidget
      v-if="sheet.name === 'add-widget'"
      :widgets="widgets"
      :values="values"
      :has-elevation="!!plan?.hasElevation"
      :has-calories="!!plan?.hasCalories"
      @add="addWidget"
    />
    <WidgetSettings
      v-else-if="sheetWidget !== null && widgets[sheetWidget]"
      :widget="widgets[sheetWidget]!"
      :title="title"
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

.layout .stage {
  position: sticky;
  top: calc(var(--top-bar-height, 0px) + 1.5rem);
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

/* Phones: the whole screen, over the app's page, which has nothing else on this step. */
.editor {
  position: fixed;
  inset: 0;
  z-index: 12;
  display: flex;
  flex-direction: column;
  background: var(--background);
}

.top {
  flex: none;
  padding-top: env(safe-area-inset-top);
  border-bottom: 1px solid var(--line);
}

/* The style chooser takes the screen under the step bar, and scrolls. */
.choosing {
  flex: 1;
  min-height: 0;
  padding: 1.2rem 1rem;
  overflow-y: auto;
}

/* The preview takes what the rest leaves. */
.editor .stage {
  flex: 1 1 0;
  min-height: 0;
  padding: 0.75rem;
}

/* The open section's settings, in a panel of fixed height so the picture does not jump. */
.tools {
  position: relative;
  flex: none;
  height: 12rem;
  padding: 0.2rem 1rem 0.8rem;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-top: 1px solid var(--line);
  background: var(--panel);
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
