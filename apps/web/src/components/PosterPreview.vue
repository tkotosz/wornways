<script lang="ts">
import { ref as moduleRef } from 'vue';

/**
 * The last draft made, for the settings it was made with. It outlives the component, so
 * going from one step to the other keeps it while the settings stay the same.
 */
const draft = moduleRef<{
  key: string;
  url: string;
  /** The draft's own frame, smaller and slower than the video's. */
  width: number;
  height: number;
  fps: number;
} | null>(null);

function dropDraft(): void {
  if (draft.value) URL.revokeObjectURL(draft.value.url);
  draft.value = null;
}
</script>

<script setup lang="ts">
// The live preview of the video: a still of it, small, redrawn shortly after the settings
// change, with the frame's shape, size and length. The still is the finished last frame, or
// for the ending the finished totals card or end card. Play makes a draft of the whole video,
// small and at a low frame rate, and plays it in place of the picture, with a bar to move to
// any moment. Where things are arranged on the still (`editing`), it opens on the still and
// Edit goes back to it from the draft. For the ending the draft starts, and loops back to,
// shortly before the replay ends (`seconds`), so the cards being arranged come at once. The
// picture is as large as the room it is given allows; on wide screens a line under it says
// when a draft is playing, on phones only the picture shows. While editing, the `layer`
// slot is drawn over the still, with the frame's size. With `bare`, the still is drawn
// without its widgets, for an editor in the slot that draws them itself: a change to the
// widgets then draws nothing again. Each still is told (`drawn`, with its scene): the widgets
// on it and the values the video can show, and for the ending the totals card's.
import { parseSettings, type SettingsInput } from '@wornways/engine';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Canceled, type EngineClient } from '../engine-client.ts';
import type { Poster, PosterScene, Progress } from '../messages.ts';

const props = withDefaults(
  defineProps<{
    engine: EngineClient;
    settings: SettingsInput;
    seconds?: number;
    /** What the still shows: the last frame, or the ending. */
    scene?: PosterScene;
    /** Things are arranged on the still: it shows until Play, and Edit goes back to it. */
    editing?: boolean;
    /** Play steps aside, as while a widget is picked on the still, to leave it to the edit. */
    hidePlay?: boolean;
    /** Draw the still without its widgets (see above). */
    bare?: boolean;
  }>(),
  { seconds: undefined, scene: 'replay', editing: false, hidePlay: false, bare: false },
);
const emit = defineEmits<{ drawn: [poster: Poster, scene: PosterScene] }>();

/** Waits this long after a change, so dragging a slider draws once, not at every step. */
const PAUSE_MS = 400;
/** For the ending, the draft starts this long before the replay ends. */
const ENDING_LEAD_S = 2;

/** Where the draft starts and loops back to: the start, or for the ending near its end. */
const startAt = computed(() =>
  props.scene === 'ending' && props.seconds !== undefined
    ? Math.max(0, props.seconds - ENDING_LEAD_S)
    : 0,
);

/** Moves the draft to where it starts; `play` for one that has come to its end. */
function toStart(event: Event, play: boolean): void {
  const video = event.target as HTMLVideoElement;
  video.currentTime = startAt.value;
  if (play) void video.play().catch(() => undefined);
}

const url = ref('');
const busy = ref(false);
const error = ref('');
let cancel: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * What the still depends on: the settings, but for a still drawn without its widgets (over
 * the replay, or on the totals card), not the widgets' places and sizes, only whether they
 * show calories, which the worker then fetches where a service gives them on request.
 */
const drawnKey = computed(() => {
  if (!props.bare) return JSON.stringify(props.settings);
  const { widgets, 'totals-widgets': totalsWidgets, ...rest } = props.settings;
  const calories = `${String(widgets ?? '')};${String(totalsWidgets ?? '')}`.includes('calories');
  return JSON.stringify({ ...rest, calories });
});
const key = computed(() => JSON.stringify(props.settings));
/** The draft of these settings, when one is made. */
/** While editing: whether the draft plays instead of the still. */
const playing = ref(false);
watch(
  () => props.editing,
  () => (playing.value = false),
);
const shownDraft = computed(() =>
  draft.value?.key === key.value && (!props.editing || playing.value) ? draft.value : null,
);
const draftUrl = computed(() => shownDraft.value?.url ?? '');
/** The draft being made: how far it is, and how to stop it. */
const drafting = ref<{ progress: Progress; cancel: () => void } | null>(null);
const draftError = ref('');

const draftStatus = computed(() => {
  const progress = drafting.value?.progress;
  if (!progress || progress.stage === 'choosing') return 'Starting the preview…';
  if (progress.stage === 'map') return 'Loading the map…';
  if (progress.stage === 'finishing') return 'Finishing the preview…';
  return 'Making the preview…';
});
/** How much of the draft is drawn, from 0 to 1. */
const draftShare = computed(() => {
  const { done, total } = drafting.value?.progress ?? {};
  return done && total ? done / total : 0;
});

function stopDraft(): void {
  drafting.value?.cancel();
  drafting.value = null;
}

async function play(): Promise<void> {
  playing.value = true;
  // A draft of these settings is already made: it plays again.
  if (draft.value?.key === key.value) return;
  stopDraft();
  draftError.value = '';
  const settingsKey = key.value;
  const task = props.engine.makeVideo(
    props.settings,
    (progress) => {
      if (drafting.value?.cancel === task.cancel) drafting.value.progress = progress;
    },
    { draft: true },
  );
  drafting.value = { progress: { stage: 'choosing' }, cancel: task.cancel };
  try {
    const { video, report } = await task.result;
    if (drafting.value?.cancel !== task.cancel) return;
    dropDraft();
    const { width, height, fps } = report;
    draft.value = { key: settingsKey, url: URL.createObjectURL(video), width, height, fps };
  } catch (caught) {
    if (drafting.value?.cancel !== task.cancel || caught instanceof Canceled) return;
    draftError.value = caught instanceof Error ? caught.message : String(caught);
  }
  drafting.value = null;
}

/** The video's frame, for the box's shape. */
const frame = computed(() => {
  try {
    const { width, height } = parseSettings(props.settings);
    return { width, height };
  } catch {
    return { width: 1080, height: 1920 };
  }
});
const aspect = computed(() => `${frame.value.width} / ${frame.value.height}`);

async function draw(): Promise<void> {
  const task = props.engine.makePoster(props.settings, props.scene, props.bare);
  cancel = task.cancel;
  try {
    const poster = await task.result;
    const { image } = poster;
    if (cancel !== task.cancel) return;
    if (url.value) URL.revokeObjectURL(url.value);
    url.value = URL.createObjectURL(image);
    emit('drawn', poster, props.scene);
    busy.value = false;
  } catch (caught) {
    // A newer drawing took over; it clears "busy" when it is done.
    if (cancel !== task.cancel || caught instanceof Canceled) return;
    if (url.value) URL.revokeObjectURL(url.value);
    url.value = '';
    error.value = caught instanceof Error ? caught.message : String(caught);
    busy.value = false;
  }
}

watch(
  [() => drawnKey.value, () => props.settings['trim-radius'], () => props.scene, () => props.bare],
  ([, radius, scene, bare], previous) => {
    clearTimeout(timer);
    cancel?.();
    cancel = null;
    // Another picture altogether: the old one would show the widgets twice, or none.
    if (
      (radius !== previous?.[1] || scene !== previous?.[2] || bare !== previous?.[3]) &&
      url.value
    ) {
      URL.revokeObjectURL(url.value);
      url.value = '';
    }
    // A draft shows the settings it was made with; a change goes back to the picture.
    if (draft.value && draft.value.key !== key.value) dropDraft();
    playing.value = false;
    stopDraft();
    draftError.value = '';
    error.value = '';
    busy.value = true;
    timer = setTimeout(() => void draw(), PAUSE_MS);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  clearTimeout(timer);
  cancel?.();
  cancel = null;
  stopDraft();
  if (url.value) URL.revokeObjectURL(url.value);
});
</script>

<template>
  <div class="preview" data-testid="preview">
    <div class="fit">
      <div class="frame" :style="{ aspectRatio: aspect, '--ratio': frame.width / frame.height }">
        <video
          v-if="draftUrl"
          :src="draftUrl"
          :poster="url || undefined"
          data-testid="preview-video"
          aria-label="Preview of the video"
          controls
          autoplay
          :loop="startAt === 0"
          muted
          playsinline
          @loadedmetadata="toStart($event, false)"
          @ended="toStart($event, true)"
        />
        <img
          v-else-if="url"
          :src="url"
          :alt="
            scene === 'ending'
              ? 'Preview: the ending of the video'
              : 'Preview: the last frame of the video'
          "
        />
        <slot
          v-if="editing && url && !draftUrl"
          name="layer"
          :ratio="frame.width / frame.height"
          :size="{ width: frame.width, height: frame.height }"
        />
        <button v-if="editing && draftUrl" type="button" class="edit" @click="playing = false">
          Edit
        </button>
        <button
          v-if="url && !draftUrl && !drafting && !busy && !hidePlay"
          type="button"
          class="play"
          aria-label="Play preview"
          @click="play"
        >
          <span aria-hidden="true">▶</span>
        </button>
        <div v-if="drafting" class="status making" role="status">
          <span>{{ draftStatus }}</span>
          <span class="bar" aria-hidden="true"
            ><span :style="{ width: `${draftShare * 100}%` }"
          /></span>
          <button type="button" class="link" @click="stopDraft">Cancel</button>
        </div>
        <span v-else-if="busy" class="status">Drawing preview…</span>
        <span v-else-if="error" class="status error">{{ error }}</span>
        <span v-else-if="draftError" class="status error">{{ draftError }}</span>
      </div>
    </div>
    <p v-if="shownDraft" class="caption muted" data-testid="draft-note">
      Playing a quick draft at {{ shownDraft.width }} × {{ shownDraft.height }} and
      {{ shownDraft.fps }} fps. The video is made in full on Export.
    </p>
  </div>
</template>

<style scoped>
/* The picture as large as fits both the width and the height it is given, keeping the video's
   shape; the lines under it below. */
.preview {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.fit {
  flex: 1 1 0;
  min-height: 0;
  container-type: size;
  display: grid;
  place-items: center;
}

.caption {
  margin: 0.6rem 0 0;
  font-size: 0.75rem;
  text-align: center;
}

.frame {
  width: min(100cqw, 100cqh * var(--ratio));
  position: relative;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #050608;
}

.frame img,
.frame video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* A round button in the middle of the picture. */
/* Back from the draft to the still, in a corner clear of the video's controls. */
.edit {
  position: absolute;
  top: 0.6rem;
  right: 0.6rem;
  padding: 0.35rem 0.9rem;
  border: 0;
  border-radius: 999px;
  color: #1a110b;
  background: var(--accent);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 700;
}

.play {
  position: absolute;
  inset: 50% auto auto 50%;
  display: grid;
  place-items: center;
  width: 3.4rem;
  height: 3.4rem;
  padding: 0 0 0 0.2rem;
  border: 0;
  border-radius: 50%;
  color: #1a110b;
  background: var(--accent);
  box-shadow: 0 0 0 6px rgba(255, 138, 42, 0.25);
  font-size: 1.2rem;
  transform: translate(-50%, -50%);
}

/* What the draft is doing, with a bar of how far it is. No transition: nothing on the page
   animates while the worker draws. */
.making {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
}

.bar {
  display: block;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.15);
  overflow: hidden;
}

.bar > span {
  display: block;
  height: 100%;
  background: var(--accent);
}

/* Cancel takes taps. */
.status button {
  pointer-events: auto;
}

/* A line over the picture says what it is doing; taps go through it to what is under it,
   except its own Cancel. */
.status {
  pointer-events: none;
  position: absolute;
  inset: auto 0.5rem 0.5rem;
  padding: 0.3rem 0.5rem;
  border-radius: 8px;
  background: rgba(5, 6, 9, 0.8);
  font-size: 0.8rem;
  text-align: center;
}

/* Phones: only the picture; the lines under it would take its room. */
@media (max-width: 760px) {
  .caption {
    display: none;
  }
}
</style>
