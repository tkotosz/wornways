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
// section's settings, one group at a time in a panel of fixed height; the sections along the
// bottom.
import type { SettingsInput } from '@wornways/engine';
import { computed, onBeforeUnmount, ref } from 'vue';
import {
  PANEL_TABS,
  PLAYBACK_PARTS,
  SECTIONS,
  countOf,
  panelOffered,
  type Adjustments,
  type PlaybackPart,
  type Section,
} from '../adjust.ts';
import FramePanel from '../components/FramePanel.vue';
import OverlayEditor from '../components/OverlayEditor.vue';
import PlaybackPanel from '../components/PlaybackPanel.vue';
import PosterPreview from '../components/PosterPreview.vue';
import SettingsGroups from '../components/SettingsGroups.vue';
import StepBar from '../components/StepBar.vue';
import StepNav from '../components/StepNav.vue';
import type { EngineClient } from '../engine-client.ts';
import type { PlanReport } from '../messages.ts';

const props = defineProps<{
  engine: EngineClient;
  /** The settings of the whole video, for the preview. */
  settings: SettingsInput;
  activities: number;
  plan: PlanReport | null;
}>();
const adjustments = defineModel<Adjustments>({ required: true });
const section = defineModel<Section>('section', { required: true });
const emit = defineEmits<{ back: []; next: [] }>();

const current = computed(() => SECTIONS.find((s) => s.id === section.value)!);

/** Phones get the editor screen; the width matches the phone layout of the app's styles. */
const phoneQuery = window.matchMedia('(max-width: 760px)');
const phone = ref(phoneQuery.matches);
const onWidth = (event: MediaQueryListEvent) => (phone.value = event.matches);
phoneQuery.addEventListener('change', onWidth);
onBeforeUnmount(() => phoneQuery.removeEventListener('change', onWidth));

/** The phone's settings panel, which scrolls by itself. */
const controls = ref<HTMLElement | null>(null);

function open(id: Section): void {
  section.value = id;
  window.scrollTo({ top: 0 });
  controls.value?.scrollTo({ top: 0 });
}

// In Overlay, the title and the metrics card are also arranged on the still (OverlayEditor);
// on phones, picking one there opens its tab.
// Phones: each section's settings in groups, a tab each: Playback in its parts, Frame in
// one, the others by panel (those this video has).
type Tab = { id: string; label: string };
const tabs = computed<Tab[]>(() => {
  if (section.value === 'frame') return [{ id: 'frame', label: 'Frame' }];
  if (section.value === 'playback') return PLAYBACK_PARTS;
  return current.value.panels
    .filter((panel) => panelOffered(panel, props.plan))
    .map((panel) => ({ id: panel, label: PANEL_TABS[panel] }));
});
/** The tab open in each section, kept while moving between sections. */
const openTabs = ref<Partial<Record<Section, string>>>({});
const tab = computed(
  () => tabs.value.find((t) => t.id === openTabs.value[section.value]) ?? tabs.value[0]!,
);

function openTab(id: string): void {
  openTabs.value = { ...openTabs.value, [section.value]: id };
  controls.value?.scrollTo({ top: 0 });
}
</script>

<template>
  <!-- Phones: the editor screen. -->
  <section v-if="phone" class="editor">
    <h1 class="visually-hidden">Design your video</h1>
    <header class="top">
      <StepBar step="design" @back="emit('back')" @next="emit('next')" />
    </header>

    <div class="stage">
      <PosterPreview
        :engine="engine"
        :settings="settings"
        :seconds="plan?.seconds"
        :scene="section === 'ending' ? 'ending' : 'replay'"
        :editing="section === 'overlay' || section === 'ending'"
      >
        <template #layer="{ boxes, ratio, placed }">
          <OverlayEditor
            v-if="section === 'overlay'"
            v-model="adjustments"
            :boxes="boxes"
            :ratio="ratio"
            @placed="placed"
            @select="openTab"
          />
        </template>
      </PosterPreview>
    </div>

    <div class="tools">
      <nav v-if="tabs.length > 1" class="tabs" :aria-label="`${current.label} settings`">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          :aria-current="t.id === tab.id ? 'true' : undefined"
          @click="openTab(t.id)"
        >
          {{ t.label }}
        </button>
      </nav>
      <div ref="controls" class="controls">
        <FramePanel v-if="section === 'frame'" v-model="adjustments" compact />
        <PlaybackPanel
          v-else-if="section === 'playback'"
          v-model="adjustments"
          :activities="activities"
          :plan="plan"
          :part="tab.id as PlaybackPart"
        />
        <SettingsGroups
          v-else
          v-model="adjustments"
          :groups="[current.panels.find((p) => p === tab.id) ?? current.panels[0]!]"
          :count="countOf(activities)"
          :plan="plan"
          compact
        />
      </div>
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
      <div class="stage">
        <PosterPreview
          :engine="engine"
          :settings="settings"
          :seconds="plan?.seconds"
          :scene="section === 'ending' ? 'ending' : 'replay'"
          :editing="section === 'overlay' || section === 'ending'"
        >
          <template #layer="{ boxes, ratio, placed }">
            <OverlayEditor
              v-if="section === 'overlay'"
              v-model="adjustments"
              :boxes="boxes"
              :ratio="ratio"
              @placed="placed"
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
        <SettingsGroups
          v-else
          v-model="adjustments"
          :groups="current.panels"
          :count="countOf(activities)"
          :plan="plan"
        />
      </div>
    </div>

    <StepNav step="design" @back="emit('back')" @next="emit('next')" />
  </section>
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

/* The preview takes what the rest leaves. */
.editor .stage {
  flex: 1 1 0;
  min-height: 0;
  padding: 0.75rem;
}

/* The open section's settings, in a panel of fixed height so the picture does not jump. */
.tools {
  flex: none;
  border-top: 1px solid var(--line);
  background: var(--panel);
}

.tabs {
  display: flex;
  gap: 1.1rem;
  padding: 0.5rem 1rem 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs button {
  flex: none;
  padding: 0.2rem 0 0.45rem;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--muted);
  background: none;
  font: inherit;
  font-size: 0.85rem;
}

.tabs button[aria-current] {
  border-color: var(--accent);
  color: var(--text);
  font-weight: 600;
}

.controls {
  height: 10.5rem;
  padding: 0.7rem 1rem;
  overflow-y: auto;
  overscroll-behavior: contain;
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
