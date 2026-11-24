<script setup lang="ts">
// The controls of a few setting groups, built from the engine's settings table: buttons
// for a choice, a slider for a number, a switch for on/off, and a few made to measure.
import { METRICS, defaultMetrics, type Metric, type SettingDefinition } from '@wornways/engine';
import { computed } from 'vue';
import {
  SHOW_TITLE,
  choiceLabel,
  offered,
  panelOffered,
  startingValue,
  type ActivityCount,
  type Panel,
  settingHint,
  settingLabel,
  sliderStep,
  type Adjustments,
} from '../adjust.ts';
import type { PlanReport } from '../messages.ts';
import ExactNumber from './ExactNumber.vue';

const props = defineProps<{
  /** The groups to show, in order. */
  groups: Panel[];
  count: ActivityCount;
  plan?: PlanReport | null;
}>();
const adjustments = defineModel<Adjustments>({ required: true });

const GROUP_TITLES: Record<Panel, string> = {
  timing: 'Timing',
  camera: 'Camera',
  privacy: 'Replay privacy',
  map: 'Map',
  title: 'Title',
  metrics: 'Metrics',
  elevation: 'Elevation',
  totals: 'Totals card',
  brand: 'Branding',
};

const groups = computed(() =>
  props.groups
    .filter((group) => panelOffered(group, props.plan))
    .map((group) => ({ group, main: offered(group) }))
    .filter((g) => g.main.length > 0),
);

/** The value set, else where the preset starts it (the totals card under Recap), else the default. */
const value = (setting: SettingDefinition) =>
  adjustments.value[setting.name] ??
  startingValue(adjustments.value, props.count, setting.name) ??
  setting.default;

/** Sets a setting; undefined puts it back to its default. */
function set(name: string, newValue: string | boolean | undefined): void {
  if (adjustments.value[name] === newValue) return;
  adjustments.value = Object.fromEntries(
    Object.entries({ ...adjustments.value, [name]: newValue }).filter(([, v]) => v !== undefined),
  ) as Adjustments;
}

function sliderValue(setting: SettingDefinition): string {
  if (setting.kind.type !== 'number') return '';
  const current = value(setting);
  if (setting.name === 'trim-radius' && current === '0') return 'Off';
  const unit = setting.kind.unit;
  return `${current}${unit === '%' ? '%' : ` ${unit}`}`;
}

// Title: the automatic one unless the person wrote another; empty for none.
const autoTitle = computed(() => props.plan?.title ?? '');
const titleSet = computed(() => typeof adjustments.value['title'] === 'string');

// Metrics: the values this video can show, and the ones picked, in order.
const showsMetrics = computed(() => adjustments.value['metrics'] !== false);
const showsTitle = computed(() => adjustments.value[SHOW_TITLE] !== false);

/** Whether a setting's row shows: a group switched off shows only its switch. */
const shown = (group: Panel, name: string) =>
  (group !== 'title' || showsTitle.value) &&
  (group !== 'metrics' || name === 'metrics' || showsMetrics.value);
/** What the metrics have to describe: one activity, all at once, or activities in turn. */
const kind = computed(() => {
  if (!props.plan) return null;
  if (props.plan.activities === 1) return 'single';
  return props.plan.groups?.race ? 'race' : 'groups';
});
const offeredMetrics = computed(() =>
  METRICS.filter((m) => {
    if (!kind.value) return false;
    if (m === 'pace') return kind.value === 'single';
    if (m === 'count') return kind.value !== 'single';
    if (m === 'date') return kind.value !== 'race';
    if (m === 'elevation') return props.plan?.hasElevation;
    return true;
  }),
);
const pickedMetrics = computed<Metric[]>(() => {
  if (!kind.value) return [];
  const set = adjustments.value['metrics-fields'];
  const picked =
    typeof set === 'string' ? (set.split(',') as Metric[]) : defaultMetrics(kind.value);
  return picked.filter((m) => offeredMetrics.value.includes(m));
});

function toggleMetric(metric: Metric): void {
  const picked = pickedMetrics.value;
  const next = picked.includes(metric) ? picked.filter((m) => m !== metric) : [...picked, metric];
  if (next.length > 0) set('metrics-fields', next.join(','));
}
</script>

<template>
  <div class="groups">
    <template v-for="g in groups" :key="g.group">
      <div v-if="g.main.length" class="group" :data-testid="`group-${g.group}`">
        <h2 v-if="GROUP_TITLES[g.group]">{{ GROUP_TITLES[g.group] }}</h2>
        <!-- The title's switch, like the metrics' one; off, the video has no title. -->
        <div v-if="g.group === 'title'" class="setting">
          <span class="label">Show title</span>
          <label class="switch">
            <input
              type="checkbox"
              role="switch"
              aria-label="Show title"
              :checked="showsTitle"
              @change="
                set(SHOW_TITLE, ($event.target as HTMLInputElement).checked ? undefined : false)
              "
            />
            <span>{{ showsTitle ? 'On' : 'Off' }}</span>
          </label>
        </div>
        <template v-for="setting in g.main" :key="setting.name">
          <div v-if="shown(g.group, setting.name)" class="setting">
            <span :id="`label-${setting.name}`" class="label">
              {{ settingLabel(setting) }}
            </span>
            <div class="control" :aria-labelledby="`label-${setting.name}`" role="group">
              <!-- A choice: one button per option; a position as a picker of the frame's nine spots. -->
              <div
                v-if="setting.kind.type === 'choice'"
                class="chips"
                :class="{ corners: setting.name.endsWith('-position') }"
              >
                <button
                  v-for="option in setting.kind.type === 'choice' ? setting.kind.choices : []"
                  :key="option"
                  type="button"
                  class="chip"
                  :aria-pressed="value(setting) === option"
                  :aria-label="
                    setting.name.endsWith('-position')
                      ? choiceLabel(setting.name, option)
                      : undefined
                  "
                  @click="set(setting.name, option)"
                >
                  {{ setting.name.endsWith('-position') ? '' : choiceLabel(setting.name, option) }}
                </button>
              </div>

              <!-- A number: a slider with its value. -->
              <div v-else-if="setting.kind.type === 'number'" class="slider">
                <input
                  type="range"
                  :min="setting.kind.min"
                  :max="setting.kind.max"
                  :step="sliderStep(setting.name)"
                  :value="Number(value(setting))"
                  :aria-label="settingLabel(setting)"
                  :aria-valuetext="sliderValue(setting)"
                  @input="
                    setting.name === 'trim-radius' &&
                    set(setting.name, ($event.target as HTMLInputElement).value)
                  "
                  @change="set(setting.name, ($event.target as HTMLInputElement).value)"
                />
                <ExactNumber
                  :label="`Exact ${setting.label.toLowerCase()} (${setting.kind.unit})`"
                  :min="setting.kind.min"
                  :max="setting.kind.max"
                  :value="Number(value(setting))"
                  :unit="setting.kind.unit"
                  @change="set(setting.name, String($event))"
                />
              </div>

              <!-- On or off. -->
              <label v-else-if="setting.kind.type === 'switch'" class="switch">
                <input
                  type="checkbox"
                  role="switch"
                  :aria-label="settingLabel(setting)"
                  :checked="value(setting) === true"
                  @change="set(setting.name, ($event.target as HTMLInputElement).checked)"
                />
                <span>{{ value(setting) === true ? 'On' : 'Off' }}</span>
              </label>

              <!-- The title: the automatic one until the person writes another. -->
              <div v-else-if="setting.name === 'title'" class="title">
                <input
                  type="text"
                  aria-label="Title"
                  placeholder="No title"
                  :value="titleSet ? adjustments['title'] : autoTitle"
                  @input="set('title', ($event.target as HTMLInputElement).value)"
                />
                <button
                  v-if="titleSet && plan"
                  type="button"
                  class="link"
                  @click="set('title', undefined)"
                >
                  Use "{{ autoTitle }}"
                </button>
              </div>

              <!-- The metrics, in the order picked. -->
              <div v-else-if="setting.name === 'metrics-fields'" class="chips">
                <button
                  v-for="metric in offeredMetrics"
                  :key="metric"
                  type="button"
                  class="chip"
                  :aria-pressed="pickedMetrics.includes(metric)"
                  @click="toggleMetric(metric)"
                >
                  <span v-if="pickedMetrics.includes(metric)" class="order">{{
                    pickedMetrics.indexOf(metric) + 1
                  }}</span>
                  {{ metric.charAt(0).toUpperCase() + metric.slice(1) }}
                </button>
                <button
                  v-if="plan && adjustments['metrics-fields'] !== undefined"
                  type="button"
                  class="link"
                  @click="set('metrics-fields', undefined)"
                >
                  Use automatic metrics
                </button>
              </div>

              <p v-if="settingHint(setting.name, count)" class="hint muted">
                {{ settingHint(setting.name, count) }}
              </p>
            </div>
          </div>
        </template>
        <!-- Room for a step to add to a group, e.g. what the timing will play. -->
        <slot :name="`after-${g.group}`" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.groups {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 1.2rem;
  border-radius: 14px;
  background: var(--panel);
}

.group h2 {
  margin: 0;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.setting {
  display: grid;
  grid-template-columns: 9rem 1fr;
  gap: 0.8rem;
  align-items: start;
}

.label {
  padding-top: 0.4rem;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

/* The position picker: nine squares standing for the frame's top, middle and bottom rows,
   each left, middle and right. */
.corners {
  display: grid;
  grid-template-columns: repeat(3, 2.2rem);
  gap: 0.3rem;
}

.corners .chip {
  height: 2.2rem;
  padding: 0;
  border-radius: 6px;
}

.order {
  display: inline-grid;
  place-items: center;
  width: 1.2rem;
  height: 1.2rem;
  margin-right: 0.3rem;
  border-radius: 50%;
  color: #160a02;
  background: var(--accent);
  font-size: 0.7rem;
  font-weight: 700;
}

.slider {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.slider input[type='range'] {
  flex: 1;
  max-width: 22rem;
}

.switch {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.35rem;
}

.title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.8rem;
}

.title input {
  flex: 1 1 14rem;
  max-width: 24rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.5rem 0.8rem;
  color: var(--text);
  background: var(--background);
  font: inherit;
}

.title input:focus {
  outline: none;
  border-color: var(--accent);
}

.hint {
  margin: 0.4rem 0 0;
  font-size: 0.85rem;
}

/* An on/off switch: a pill with a knob that slides to the right when on. */
.switch input {
  appearance: none;
  position: relative;
  width: 2.6rem;
  height: 1.5rem;
  margin: 0;
  border-radius: 999px;
  background: var(--line);
  cursor: pointer;
  transition: background 0.15s;
}

.switch input::after {
  content: '';
  position: absolute;
  top: 0.2rem;
  left: 0.2rem;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 50%;
  background: var(--text);
  transition: transform 0.15s;
}

.switch input:checked {
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
}

.switch input:checked::after {
  transform: translateX(1.1rem);
}

@media (max-width: 600px) {
  .setting {
    grid-template-columns: 1fr;
    gap: 0.4rem;
  }
}
</style>
