<script setup lang="ts">
// A line telling what the settings will actually play: how many groups, of what, and how
// long each one gets, worked out by the engine without drawing anything.
import { countText } from '../format.ts';
import type { PlanReport } from '../messages.ts';

defineProps<{ plan: PlanReport }>();

const UNITS = {
  activity: ['activity', 'activities'],
  day: ['day', 'days'],
  week: ['week', 'weeks'],
  month: ['month', 'months'],
} as const;

function pacingText(plan: PlanReport): string {
  const text = groupsText(plan);
  return plan.followTooShort
    ? `${text} The activities are too short to follow, so the camera zooms out instead.`
    : text;
}

function groupsText({
  activities,
  seconds,
  groups,
  realPace,
  follows,
  overlap,
}: PlanReport): string {
  const all = countText(activities, 'activity', 'activities');
  if (!groups)
    return `One activity plays at its own pace, in ${Number(seconds.toFixed(1))} s; grouping does not apply.`;
  if (groups.race) return `This video: a race of all ${all}, each at its real pace.`;
  const [shortest, longest] = [groups.shortest, groups.longest].map((s) => Number(s.toFixed(1)));
  const each = shortest === longest ? `${shortest} s` : `${shortest}–${longest} s`;
  if (groups.unit === 'all')
    return follows
      ? `This video: all ${all} in turn, over ${each}.`
      : `This video: all ${all} together, each drawn over ${each}.`;
  const [one, many] = UNITS[groups.unit];
  const covered = groups.unit === 'activity' ? '' : ` (${all})`;
  const pace =
    groups.unit === 'activity'
      ? ''
      : follows
        ? ', following each activity in turn'
        : realPace
          ? ', each group a race at real pace'
          : '';
  const overlapping = overlap > 0 && groups.count > 1 ? `, overlapping ${overlap}%` : '';
  return `This video: ${countText(groups.count, one, many)}${covered}, ${each} each${pace}${overlapping}.`;
}
</script>

<template>
  <p class="pacing" data-testid="pacing">{{ pacingText(plan) }}</p>
</template>

<style scoped>
.pacing {
  margin: 0;
}
</style>
