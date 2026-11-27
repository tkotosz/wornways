<script setup lang="ts">
// Where the activities come from. One source is used at a time: files saved on this device,
// Strava, Ride with GPS, or the demo's made-up activities; they are never mixed. On the first
// visit it is the first thing shown, with a line on what the app does.
import { computed, onMounted, ref } from 'vue';
import AppPopup from '../components/AppPopup.vue';
import LoadingStatus from '../components/LoadingStatus.vue';
import SourceIcon from '../components/SourceIcon.vue';
import type { EngineClient } from '../engine-client.ts';
import { countText, timeText } from '../format.ts';
import type { Source } from '../messages.ts';
import { SOURCE_NAMES } from '../sources.ts';

const props = defineProps<{
  engine: EngineClient;
  closable: boolean;
  /** The source in use; null until one is picked. */
  chosen: Source | null;
  /** How many activities the files source holds. */
  files: number;
  /** Strava: offered by this site, and until when it is connected (null when not). */
  strava: { offered: boolean; until: number | null };
  /** Ride with GPS: offered by this site, and connected in this browser. */
  rwgps: { available: boolean; connected: boolean };
  /** What is loading (the demo), and what went wrong. */
  busy: string;
  error: string;
}>();
const emit = defineEmits<{ close: []; menu: []; choose: [source: Source] }>();

/**
 * How many activities the demo holds (public/demo/mallorca.zip). It loads only when picked,
 * so its card says it from here; a browser test checks the two agree.
 */
const DEMO_ACTIVITIES = 25;

/** How many tracks each service keeps on this device, for its card. */
const counts = ref({ strava: 0, rwgps: 0 });
const withCount = (status: string, count: number) =>
  count ? `${status} · ${count} downloaded` : status;

onMounted(async () => {
  const count = (service: 'strava' | 'rwgps') =>
    props.engine.downloadedCount(service).catch(() => 0);
  const [strava, rwgps] = await Promise.all([count('strava'), count('rwgps')]);
  counts.value = { strava, rwgps };
});

const stravaConnected = computed(() => !!props.strava.until && props.strava.until > Date.now());

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
      status: props.files
        ? `${countText(props.files, 'activity', 'activities')} on this device`
        : 'Nothing added yet',
    },
  ];
  if (props.rwgps.available)
    list.push({
      id: 'rwgps',
      about: 'Your Ride with GPS trips.',
      status: props.rwgps.connected ? withCount('Connected', counts.value.rwgps) : 'Not connected',
    });
  if (props.strava.offered || stravaConnected.value)
    list.push({
      id: 'strava',
      about: 'Your Strava activities, kept for up to two hours.',
      status: stravaConnected.value
        ? withCount(`Connected until ${timeText(props.strava.until!)}`, counts.value.strava)
        : 'Not connected',
    });
  return list;
});
</script>

<template>
  <AppPopup
    title="Choose a source"
    :closable="closable"
    @close="emit('close')"
    @menu="emit('menu')"
  >
    <!-- What the app is for, until a source is chosen. -->
    <p v-if="chosen === null" class="intro" data-testid="intro">
      Wornways turns your GPS activities into a short video: your routes build up over a street map,
      one after another or all at once, ready to share. Wornways makes your video on this device.
      Pick where your activities come from.
    </p>
    <div class="choices" data-testid="sources">
      <button
        v-for="c in choices"
        :key="c.id"
        type="button"
        class="choice"
        :class="{ current: c.id === chosen }"
        :aria-current="c.id === chosen ? 'true' : undefined"
        :data-testid="`choose-${c.id}`"
        :disabled="!!busy"
        @click="emit('choose', c.id)"
      >
        <SourceIcon class="icon" :source="c.id" />
        <span class="text">
          <strong>{{ SOURCE_NAMES[c.id] }}</strong>
          <span class="muted">{{ c.about }}</span>
          <span v-if="c.status" class="status">{{ c.status }}</span>
        </span>
      </button>
    </div>
    <LoadingStatus v-if="busy" :text="busy" />
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </AppPopup>
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
  margin: 1rem 0;
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

.choice.current {
  border-color: var(--accent);
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
</style>
