<script setup lang="ts">
// A line telling what the settings will actually play: how many groups, of what, and how
// long each one gets, worked out by the engine without drawing anything.
import type { SettingsInput } from '@wornways/engine';
import { onBeforeUnmount, ref, watch } from 'vue';
import type { EngineClient } from '../engine-client.ts';
import { countText } from '../format.ts';
import type { PlanReport } from '../messages.ts';

const props = defineProps<{ engine: EngineClient; settings: SettingsInput }>();

const UNITS = {
  activity: ['activity', 'activities'],
  day: ['day', 'days'],
  week: ['week', 'weeks'],
  month: ['month', 'months'],
} as const;

/** What the settings will play, e.g. "12 months (312 activities), 2.3 s each"; empty for none. */
const pacing = ref('');
/** Only the newest answer counts: settings can change while one is on its way. */
let asked = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

async function askPlan(): Promise<void> {
  const ask = ++asked;
  let plan: PlanReport | null = null;
  try {
    plan = await props.engine.plan(props.settings);
  } catch {
    // Settings that choose nothing: the other steps say so.
  }
  if (ask === asked) pacing.value = plan ? pacingText(plan) : '';
}

function pacingText({ activities, seconds, groups, realPace, overlap }: PlanReport): string {
  const all = countText(activities, 'activity', 'activities');
  if (!groups)
    return `One activity plays at its own pace, in ${Number(seconds.toFixed(1))} s; grouping does not apply.`;
  if (groups.race) return `This video: a race of all ${all}, each at its real pace.`;
  const [shortest, longest] = [groups.shortest, groups.longest].map((s) => Number(s.toFixed(1)));
  const each = shortest === longest ? `${shortest} s` : `${shortest}–${longest} s`;
  if (groups.unit === 'all') return `This video: all ${all} together, each drawn over ${each}.`;
  const [one, many] = UNITS[groups.unit];
  const covered = groups.unit === 'activity' ? '' : ` (${all})`;
  const pace = realPace && groups.unit !== 'activity' ? ', each group a race at real pace' : '';
  const overlapping = overlap > 0 && groups.count > 1 ? `, overlapping ${overlap}%` : '';
  return `This video: ${countText(groups.count, one, many)}${covered}, ${each} each${pace}${overlapping}.`;
}

watch(
  () => JSON.stringify(props.settings),
  () => {
    clearTimeout(timer);
    timer = setTimeout(() => void askPlan(), 150);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <p v-if="pacing" class="pacing" data-testid="pacing">{{ pacing }}</p>
</template>

<style scoped>
.pacing {
  margin: 0;
}
</style>
