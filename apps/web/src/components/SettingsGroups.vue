<script setup lang="ts">
// The controls of a few setting groups, built from the engine's settings table: buttons
// for a choice, a slider for a number, a switch for on/off, and a few made to measure.
import { type SettingDefinition } from '@wornways/engine';
import { computed } from 'vue';
import {
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
  /**
   * Phones: `rows` lists the settings, a row each with its value, and `open` asks for one
   * to be shown alone (`only`), in a sheet. Without either, a box per group.
   */
  view?: 'rows';
  only?: string;
}>();
const adjustments = defineModel<Adjustments>({ required: true });
const emit = defineEmits<{ open: [name: string, label: string] }>();

const GROUP_TITLES: Record<Panel, string> = {
  timing: 'Timing',
  camera: 'Camera',
  privacy: 'Replay privacy',
  map: 'Map',
  watermark: 'Watermark',
  pause: 'End pause',
  totals: 'Totals card',
  'end-card': 'End card',
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

/** Whether the totals card is on: set, or started by the preset (Recap). */
const showsTotals = computed(
  () =>
    (adjustments.value['totals-card'] ??
      startingValue(adjustments.value, props.count, 'totals-card')) === true,
);

/** Whether a setting's row shows: the totals card switched off shows only its switch. */
const shown = (group: Panel, name: string) =>
  group !== 'totals' || name === 'totals-card' || showsTotals.value;
/** A setting's value in words, for its row: "30 s", "Day", "Activities, Kilometers". */
function valueText(setting: SettingDefinition): string {
  if (setting.kind.type === 'number') return sliderValue(setting);
  return choiceLabel(setting.name, String(value(setting)));
}
</script>

<template>
  <!-- Phones: a list, a row per setting with its value. A row opens the setting on its own
       (`open`); a switch turns in place. The totals card switched off shows only its switch. -->
  <div v-if="view === 'rows'" class="setting-rows">
    <template v-for="g in groups" :key="g.group">
      <h3 v-if="groups.length > 1" class="setting-rows-title" :data-group="g.group">
        {{ GROUP_TITLES[g.group] }}
      </h3>
      <template v-for="setting in g.main" :key="setting.name">
        <template v-if="shown(g.group, setting.name)">
          <label v-if="setting.kind.type === 'switch'" class="setting-row">
            <span>{{ settingLabel(setting) }}</span>
            <span class="switch">
              <input
                type="checkbox"
                role="switch"
                :aria-label="settingLabel(setting)"
                :checked="value(setting) === true"
                @change="set(setting.name, ($event.target as HTMLInputElement).checked)"
              />
            </span>
          </label>
          <button
            v-else
            type="button"
            class="setting-row"
            :aria-label="`${settingLabel(setting)}: ${valueText(setting)}`"
            aria-haspopup="dialog"
            @click="emit('open', setting.name, settingLabel(setting))"
          >
            <span>{{ settingLabel(setting) }}</span>
            <span class="value">{{ valueText(setting) }}</span>
          </button>
        </template>
      </template>
    </template>
  </div>

  <!-- Wide screens: a box per group. One setting (`only`): its control alone, at full width,
       with its explanation; the sheet around it says which. -->
  <div v-else class="groups" :class="{ one: only }">
    <template v-for="g in groups" :key="g.group">
      <div
        v-if="!only || g.main.some((setting) => setting.name === only)"
        class="group"
        :data-testid="`group-${g.group}`"
      >
        <h2 v-if="!only">{{ GROUP_TITLES[g.group] }}</h2>
        <template v-for="setting in g.main" :key="setting.name">
          <div v-if="only ? setting.name === only : shown(g.group, setting.name)" class="setting">
            <span :id="`label-${setting.name}`" class="label">{{ settingLabel(setting) }}</span>
            <div class="control" :aria-labelledby="`label-${setting.name}`" role="group">
              <!-- A choice: one button per option. -->
              <div v-if="setting.kind.type === 'choice'" class="chips" :class="{ options: only }">
                <button
                  v-for="option in setting.kind.type === 'choice' ? setting.kind.choices : []"
                  :key="option"
                  type="button"
                  class="chip"
                  :aria-pressed="value(setting) === option"
                  @click="set(setting.name, option)"
                >
                  {{ choiceLabel(setting.name, option) }}
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

              <p v-if="settingHint(setting.name, count)" class="hint muted">
                {{ settingHint(setting.name, count) }}
              </p>
            </div>
          </div>
        </template>
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

@media (max-width: 600px) {
  .setting {
    grid-template-columns: 1fr;
    gap: 0.4rem;
  }
}

/* One setting alone, in a sheet that names it: no box, heading or label, the control at
   full width with its explanation under it. */
.groups.one .group {
  padding: 0;
  background: none;
}

.groups.one .setting {
  grid-template-columns: 1fr;
}

.groups.one .label {
  display: none;
}

/* A choice alone: an option per row, across the sheet. */
.groups.one .options {
  flex-direction: column;
  gap: 0.45rem;
}

.groups.one .options .chip {
  padding: 0.7rem 0.9rem;
  border-radius: 10px;
  text-align: left;
}

.groups.one .title input {
  max-width: none;
}

.groups.one .slider input[type='range'] {
  max-width: none;
}

.setting-row .switch {
  padding-top: 0;
}
</style>
