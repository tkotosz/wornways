<script setup lang="ts">
// The live preview of the video: its finished last frame, small, redrawn shortly after the
// settings change, with the frame's shape, size and length. It stays in view beside the
// settings on wide screens and sits above them on phones.
import { parseSettings, type SettingsInput } from '@wornways/engine';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Canceled, type EngineClient } from '../engine-client.ts';

const props = defineProps<{ engine: EngineClient; settings: SettingsInput; seconds?: number }>();

/** Waits this long after a change, so dragging a slider draws once, not at every step. */
const PAUSE_MS = 400;

const url = ref('');
const busy = ref(false);
const error = ref('');
let cancel: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/** The video's frame and length, for the box's shape and the lines around the picture. */
const frame = computed(() => {
  try {
    const { width, height, fps, duration } = parseSettings(props.settings);
    return { width, height, fps, duration };
  } catch {
    return { width: 1080, height: 1920, fps: 30, duration: 30 };
  }
});
const aspect = computed(() => `${frame.value.width} / ${frame.value.height}`);
const SHAPES: Record<string, string> = {
  '9:16': 'Story 9:16',
  '1:1': 'Square 1:1',
  '16:9': 'Landscape 16:9',
};
/** "Story 9:16" for a named shape, else the size. */
const shape = computed(() => {
  const { width, height } = frame.value;
  if (width === height) return SHAPES['1:1'];
  if (width * 16 === height * 9) return SHAPES['9:16'];
  if (width * 9 === height * 16) return SHAPES['16:9'];
  return `${width} × ${height}`;
});

async function draw(): Promise<void> {
  const task = props.engine.makePoster(props.settings);
  cancel = task.cancel;
  try {
    const image = await task.result;
    if (cancel !== task.cancel) return;
    if (url.value) URL.revokeObjectURL(url.value);
    url.value = URL.createObjectURL(image);
    busy.value = false;
  } catch (caught) {
    // A newer drawing took over; it clears "busy" when it is done.
    if (cancel !== task.cancel || caught instanceof Canceled) return;
    error.value = caught instanceof Error ? caught.message : String(caught);
    busy.value = false;
  }
}

watch(
  [() => JSON.stringify(props.settings), () => props.settings['trim-radius']],
  ([, radius], previous) => {
    clearTimeout(timer);
    cancel?.();
    cancel = null;
    if (radius !== previous?.[1] && url.value) {
      URL.revokeObjectURL(url.value);
      url.value = '';
    }
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
  if (url.value) URL.revokeObjectURL(url.value);
});
</script>

<template>
  <div class="preview" data-testid="preview">
    <div class="heading">
      <span class="dot" aria-hidden="true" />
      Live preview
      <span class="shape">{{ shape }}</span>
    </div>
    <div class="frame" :style="{ aspectRatio: aspect }">
      <img v-if="url" :src="url" alt="Preview: the last frame of the video" />
      <span v-if="busy" class="status">Drawing preview…</span>
      <span v-else-if="error" class="status error">{{ error }}</span>
    </div>
    <p class="caption muted">
      {{ frame.width }} × {{ frame.height }} · {{ frame.fps }} fps ·
      {{ Number((seconds ?? frame.duration).toFixed(1)) }} s
    </p>
  </div>
</template>

<style scoped>
/* A box, kept in view beside the settings while they scroll. */
.preview {
  position: sticky;
  /* Below the app's top bar, which sticks to the window too. */
  top: calc(var(--top-bar-height, 0px) + 1.5rem);
  padding: 0.9rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--panel);
}

.heading {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.8rem;
  color: var(--muted);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 4px rgba(255, 138, 42, 0.15);
}

.shape {
  margin-left: auto;
  color: var(--text);
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  font-size: 0.75rem;
}

.caption {
  margin: 0.6rem 0 0;
  font-size: 0.75rem;
  text-align: center;
}

.frame {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #050608;
}

.frame img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.status {
  position: absolute;
  inset: auto 0.5rem 0.5rem;
  padding: 0.3rem 0.5rem;
  border-radius: 8px;
  background: rgba(5, 6, 9, 0.8);
  font-size: 0.8rem;
  text-align: center;
}

/* Phones: above the settings, small enough to leave room for them. */
@media (max-width: 760px) {
  .preview {
    position: static;
  }

  .frame {
    max-height: 32vh;
    margin: 0 auto;
  }
}
</style>
