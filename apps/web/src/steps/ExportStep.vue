<script setup lang="ts">
// The last step: a stage in the video's shape. First it shows the finished picture with a
// button to make the video; while the video is made, its progress; then the video itself,
// with Share (where the browser can share files, mostly on phones) and Download in the
// bottom bar. The finished video belongs to the app frame, which keeps
// it while the settings stay the same.
import { parseSettings, type SettingsInput } from '@wornways/engine';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Canceled, type EngineClient } from '../engine-client.ts';
import { countText, kmText } from '../format.ts';
import type { MadeVideo } from '../made-video.ts';
import type { PlanReport, Progress } from '../messages.ts';

const props = defineProps<{
  engine: EngineClient;
  settings: SettingsInput;
  plan: PlanReport | null;
  planError: string;
}>();
const emit = defineEmits<{ back: [] }>();
const result = defineModel<MadeVideo | null>('video', { required: true });

const parsed = computed(() => {
  try {
    return parseSettings(props.settings);
  } catch {
    return null;
  }
});
const settingsKey = computed(() => JSON.stringify(props.settings));
const trimRadius = computed(() => parsed.value?.trimRadius ?? 0);

/** The settings in words, e.g. "1080 × 1920 · 30 s + end card". */
const summary = computed(() => {
  const s = parsed.value;
  if (!s) return '';
  const seconds = Number((props.plan?.seconds ?? s.duration).toFixed(1));
  const length = s.endCard ? `${seconds} s + end card` : `${seconds} s`;
  return `${s.width} × ${s.height} · ${length}`;
});

/**
 * The stage has the video's shape and is as large as fits: as wide as the page, or as wide
 * as the room under the bars allows at that shape.
 */
const stageStyle = computed(() => {
  const [w, h] = parsed.value ? [parsed.value.width, parsed.value.height] : [9, 16];
  const room = '(100dvh - var(--top-bar-height, 0px) - 18rem)';
  return { aspectRatio: `${w} / ${h}`, width: `min(100%, calc(${room} * ${w / h}))` };
});

// The finished picture, shown until the video is made.
const poster = ref('');
let cancelPoster: (() => void) | null = null;
let left = false;

/** Draws the finished picture for the current settings, unless the video is made. */
async function drawPoster(): Promise<void> {
  cancelPoster?.();
  cancelPoster = null;
  if (poster.value) URL.revokeObjectURL(poster.value);
  poster.value = '';
  if (result.value) return;
  const task = props.engine.makePoster(props.settings);
  cancelPoster = task.cancel;
  try {
    const image = await task.result;
    if (left || cancelPoster !== task.cancel) return;
    poster.value = URL.createObjectURL(image);
  } catch {
    // Without a picture the stage stays dark; the video can still be made. A newer
    // picture that took over shows instead.
  } finally {
    if (cancelPoster === task.cancel) cancelPoster = null;
  }
}

onMounted(drawPoster);

const progress = ref<Progress | null>(null);
const error = ref('');
let cancel: (() => void) | null = null;

// Settings that change while the step shows (as they may from elsewhere) draw it again.
watch(settingsKey, () => {
  cancel?.();
  cancel = null;
  progress.value = null;
  result.value = null;
  error.value = '';
  void drawPoster();
});

const STAGES: Record<Progress['stage'], string> = {
  reading: 'Reading',
  storing: 'Saving',
  choosing: 'Choosing the activities',
  map: 'Loading the map',
  drawing: 'Drawing the video',
  finishing: 'Finishing the video',
};

const percent = computed(() => {
  const p = progress.value;
  if (!p) return 0;
  if (p.stage === 'drawing' && p.total) return Math.round(((p.done ?? 0) / p.total) * 100);
  return p.stage === 'finishing' ? 100 : 0;
});

async function make(): Promise<void> {
  if (progress.value || !props.plan || !parsed.value) return;
  const key = settingsKey.value;
  cancelPoster?.();
  result.value = null;
  error.value = '';
  progress.value = { stage: 'choosing' };
  const task = props.engine.makeVideo(props.settings, (p) => {
    if (cancel === task.cancel && key === settingsKey.value) progress.value = p;
  });
  cancel = task.cancel;
  try {
    const { video, report } = await task.result;
    if (left || cancel !== task.cancel || key !== settingsKey.value) return;
    const file = new File([video], report.fileName, { type: 'video/mp4' });
    result.value = { file, url: URL.createObjectURL(file), report, settingsKey: key };
  } catch (caught) {
    if (
      !left &&
      cancel === task.cancel &&
      key === settingsKey.value &&
      !(caught instanceof Canceled)
    )
      error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    if (cancel === task.cancel) {
      progress.value = null;
      cancel = null;
    }
  }
}

/** Whether this browser can hand the video to other apps (the system's share sheet). */
const canShare = computed(() => {
  const file = result.value?.file;
  return !!file && 'canShare' in navigator && navigator.canShare({ files: [file] });
});

async function share(): Promise<void> {
  error.value = '';
  try {
    await navigator.share({ files: [result.value!.file] });
  } catch (caught) {
    // Closing the share sheet is not a problem.
    if (caught instanceof DOMException && caught.name === 'AbortError') return;
    const reason = caught instanceof Error ? caught.message : String(caught);
    error.value = `The video could not be shared: ${reason}`;
  }
}

// Leaving the step stops a video or a picture that is still being made.
onBeforeUnmount(() => {
  left = true;
  cancel?.();
  cancelPoster?.();
  if (poster.value) URL.revokeObjectURL(poster.value);
});
</script>

<template>
  <section>
    <h1>Make your video</h1>
    <p v-if="!trimRadius && plan" class="muted">
      A replay of {{ countText(plan.activities, 'activity', 'activities') }} ({{
        kmText(plan.meters)
      }}). It is made on this device.
    </p>
    <p v-if="trimRadius" class="muted" role="status">
      {{ trimRadius }} m trim radius at each start and finish.
      <template v-if="plan">
        {{ countText(plan.activities, 'activity', 'activities') }} in the replay ({{
          kmText(plan.meters)
        }}).
        <template v-if="plan.privacyOmitted">
          {{ countText(plan.privacyOmitted, 'activity', 'activities') }} omitted after trimming.
        </template>
      </template>
    </p>
    <p v-if="planError" class="error" role="alert">{{ planError }}</p>

    <div class="stage" :style="stageStyle">
      <video
        v-if="result"
        :src="result.url"
        controls
        autoplay
        muted
        playsinline
        data-testid="result"
      />
      <template v-else>
        <img v-if="poster" :src="poster" alt="The last frame of the video" />
        <div class="cover">
          <div v-if="progress" class="progress" data-testid="progress">
            <span
              >{{ STAGES[progress.stage]
              }}<template v-if="percent">, {{ percent }}%</template></span
            >
            <div class="bar"><div :style="{ width: `${percent}%` }" /></div>
            <button type="button" class="secondary" @click="cancel?.()">Cancel</button>
          </div>
          <button v-else type="button" class="make" :disabled="!plan || !parsed" @click="make">
            <span class="play" aria-hidden="true">▶</span>
            Make video
          </button>
        </div>
      </template>
    </div>

    <p class="summary muted">
      <span data-testid="video-summary">{{ summary }}</span>
      <span v-if="result" data-testid="made">
        · made: {{ countText(result.report.activities, 'activity', 'activities') }},
        {{ result.report.seconds.toFixed(1) }} s
      </span>
    </p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="result?.report.mapError" class="error">
      The map could not be loaded, so the video has no map: {{ result.report.mapError }}.
      <button type="button" class="link" @click="make">Try again</button>
    </p>

    <div class="footer">
      <button type="button" class="secondary" :disabled="!!progress" @click="emit('back')">
        ← Back
      </button>
      <span v-if="result && !progress" class="actions">
        <!-- Where sharing works, it is the main thing to do; elsewhere downloading is. -->
        <a
          :class="canShare ? 'secondary' : 'primary'"
          class="download"
          :href="result.url"
          :download="result.file.name"
        >
          Download
        </a>
        <button v-if="canShare" type="button" class="primary" @click="share">Share</button>
      </span>
    </div>
  </section>
</template>

<style scoped>
/* The video's shape, as large as fits under the bars (its width is set in the script). */
.stage {
  position: relative;
  min-width: 12rem;
  margin: 1.5rem auto 0.6rem;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #050608;
}

.stage img,
.stage video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Over the picture: darkened, with the button or the progress in the middle. */
.cover {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(5, 6, 9, 0.45);
}

.make {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  border: 0;
  border-radius: 999px;
  padding: 0.9rem 1.6rem 0.9rem 1rem;
  color: #160a02;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  font-size: 1.1rem;
  font-weight: 700;
}

.make:disabled {
  opacity: 0.55;
  cursor: default;
}

.play {
  display: inline-grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 50%;
  background: rgba(22, 10, 2, 0.15);
  font-size: 0.9rem;
}

.progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.8rem;
  width: min(80%, 18rem);
  padding: 1rem;
  border-radius: 12px;
  background: rgba(5, 6, 9, 0.75);
  text-align: center;
}

.bar {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--line);
  overflow: hidden;
}

.bar div {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
  transition: width 0.2s;
}

.summary {
  margin: 0;
  text-align: center;
  font-size: 0.9rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}

.download {
  text-decoration: none;
}
</style>
