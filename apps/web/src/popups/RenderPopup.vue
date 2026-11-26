<script setup lang="ts">
// Making the video, from Render in the top bar: a stage in the video's shape. While the video
// is made, its progress over the finished picture, with Cancel; then the video itself, with
// Share (where the browser can share files, mostly on phones) and Download. Closing it goes
// back to editing, and stops a video still being made. The finished video belongs to the
// app frame, which keeps it while the settings stay the same, so Render shows it again
// without making it twice.
import { parseSettings, type SettingsInput } from '@wornways/engine';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import AppPopup from '../components/AppPopup.vue';
import { Canceled, type EngineClient } from '../engine-client.ts';
import type { MadeVideo } from '../made-video.ts';
import type { PlanReport, Progress } from '../messages.ts';

const props = defineProps<{
  engine: EngineClient;
  settings: SettingsInput;
  plan: PlanReport | null;
  planError: string;
}>();
const emit = defineEmits<{ close: [] }>();
const result = defineModel<MadeVideo | null>('video', { required: true });

const parsed = computed(() => {
  try {
    return parseSettings(props.settings);
  } catch {
    return null;
  }
});
const settingsKey = computed(() => JSON.stringify(props.settings));

/**
 * The stage has the video's shape and is as large as fits: as wide as the page, or as wide
 * as the room under the bars allows at that shape.
 */
const stageStyle = computed(() => {
  const [w, h] = parsed.value ? [parsed.value.width, parsed.value.height] : [9, 16];
  const room = '(100dvh - 12rem)';
  return { aspectRatio: `${w} / ${h}`, width: `min(100%, calc(${room} * ${w / h}))` };
});

let left = false;

const progress = ref<Progress | null>(null);
const error = ref('');
let cancel: (() => void) | null = null;

// Settings that change while it shows (as they may from elsewhere) stop the video made.
watch(settingsKey, () => {
  cancel?.();
  cancel = null;
  progress.value = null;
  result.value = null;
  error.value = '';
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

// Render makes the video at once; the plan it needs may still be on its way.
watch(
  () => !!props.plan && !!parsed.value,
  (ready) => {
    if (ready && !result.value && !progress.value && !error.value) void make();
  },
  { immediate: true },
);

/** Stops making the video, and closes. */
function stop(): void {
  cancel?.();
  emit('close');
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

// Closing stops a video that is still being made.
onBeforeUnmount(() => {
  left = true;
  cancel?.();
});
</script>

<template>
  <AppPopup title="Your video" :closable="true" @close="emit('close')">
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
        <div class="cover">
          <div v-if="progress" class="progress" data-testid="progress">
            <span
              >{{ STAGES[progress.stage]
              }}<template v-if="percent">, {{ percent }}%</template></span
            >
            <div class="bar"><div :style="{ width: `${percent}%` }" /></div>
          </div>
          <button v-else-if="error" type="button" class="secondary" @click="make">Try again</button>
        </div>
      </template>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="result?.report.mapError" class="error">
      The map could not be loaded, so the video has no map: {{ result.report.mapError }}.
      <button type="button" class="link" @click="make">Try again</button>
    </p>

    <template #footer>
      <button v-if="progress" type="button" class="secondary" @click="stop">Cancel</button>
      <template v-else-if="result">
        <!-- Where sharing works, it is the main thing to do and comes last; elsewhere Download
             is the main thing. -->
        <a
          :class="canShare ? 'secondary' : 'primary'"
          class="download"
          :href="result.url"
          :download="result.file.name"
        >
          Download
        </a>
        <button v-if="canShare" type="button" class="primary" @click="share">Share</button>
      </template>
    </template>
  </AppPopup>
</template>

<style scoped>
/* The video's shape, as large as fits under the bars (its width is set in the script). */
.stage {
  position: relative;
  min-width: 12rem;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #050608;
}

.stage video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Over the dark stage: the progress in the middle. */
.cover {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(5, 6, 9, 0.45);
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

/*
 * The bar moves in small steps, without a transition, on purpose. An animation here keeps
 * the page drawing 60 times a second for as long as the video is made, and the browser
 * then holds back the GPU work of the worker that draws the video: with a 0.2 s transition
 * a video took about half as long again.
 */
.bar div {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
}

.download {
  text-decoration: none;
}
</style>
