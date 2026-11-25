<script setup lang="ts">
// Step 3: the video itself, in sections, in the order things are decided: the frame, how
// the routes play, the map, what is drawn over the replay, and how it ends. One preview stays
// beside them while the sections change. Where things are arranged on the picture (Overlay,
// Ending), it opens on a still; Play shows the draft and Edit goes back.
import type { SettingsInput } from '@wornways/engine';
import { computed } from 'vue';
import { SECTIONS, countOf, type Adjustments, type Section } from '../adjust.ts';
import FramePanel from '../components/FramePanel.vue';
import PlaybackPanel from '../components/PlaybackPanel.vue';
import PosterPreview from '../components/PosterPreview.vue';
import SettingsGroups from '../components/SettingsGroups.vue';
import type { EngineClient } from '../engine-client.ts';
import type { PlanReport } from '../messages.ts';

defineProps<{
  engine: EngineClient;
  /** The settings of the whole video, for the preview. */
  settings: SettingsInput;
  activities: number;
  plan: PlanReport | null;
}>();
const adjustments = defineModel<Adjustments>({ required: true });
const section = defineModel<Section>('section', { required: true });
const emit = defineEmits<{ back: []; next: [] }>();

const index = computed(() => SECTIONS.findIndex((s) => s.id === section.value));
const current = computed(() => SECTIONS[index.value]!);

function open(id: Section): void {
  section.value = id;
  window.scrollTo({ top: 0 });
}

/** Back goes to the section before, and from the first to the step before. */
function back(): void {
  if (index.value === 0) emit('back');
  else open(SECTIONS[index.value - 1]!.id);
}

/** Continue goes to the next section, and from the last to the next step. */
function next(): void {
  if (index.value === SECTIONS.length - 1) emit('next');
  else open(SECTIONS[index.value + 1]!.id);
}
</script>

<template>
  <section>
    <h1>{{ current.heading }}</h1>
    <nav class="sections" aria-label="Sections">
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
      <PosterPreview
        class="preview"
        :engine="engine"
        :settings="settings"
        :seconds="plan?.seconds"
        :scene="section === 'ending' ? 'ending' : 'replay'"
        :editing="section === 'overlay' || section === 'ending'"
      />
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

    <div class="footer">
      <button type="button" class="secondary" @click="back">← Back</button>
      <button type="button" class="primary" @click="next">Continue →</button>
    </div>
  </section>
</template>

<style scoped>
/* The sections as a row of pills under the heading, the open one filled. */
.sections {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.4rem 0 1.5rem;
}

.sections .chip[aria-current='step'] {
  border-color: var(--accent);
  color: #1a110b;
  background: var(--accent);
}

/* The preview beside the settings. */
.layout {
  display: grid;
  grid-template-columns: 17rem 1fr;
  gap: 1.5rem;
  align-items: start;
}

.settings {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}

/* Phones: one column, the preview first so each change shows at once. */
@media (max-width: 760px) {
  .layout {
    grid-template-columns: 1fr;
  }
}

/* Narrow phones: the five sections on one row, each a fifth of it. */
@media (max-width: 480px) {
  .sections {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.3rem;
  }

  .sections .chip {
    justify-content: center;
    padding-inline: 0.2rem;
    font-size: 0.8rem;
  }
}
</style>
