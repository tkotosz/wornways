<script setup lang="ts">
// A day picker in the app's style: a field that opens a month calendar under it. The value
// is a calendar day, month or year, or empty when no bound is chosen.
import { parseSettings } from '@wornways/engine';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{ label: string }>();
const value = defineModel<string>({ required: true });

const open = ref(false);
const draft = ref('');
const dateError = ref('');
const root = ref<HTMLElement | null>(null);
/** The month the calendar shows: its year and month index (0 = January). */
const view = ref({ year: 0, month: 0 });

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) =>
  `${String(d.getFullYear()).padStart(4, '0')}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** The value as a local date; null when empty. */
const chosen = computed(() => {
  if (!value.value) return null;
  try {
    return new Date(parseSettings({ from: value.value }).from!);
  } catch {
    return null;
  }
});

const shortDay = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const longDay = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const monthTitle = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const shown = computed(() => {
  if (!chosen.value) return 'Any day';
  if (value.value.length === 4) return value.value;
  return (value.value.length === 7 ? monthTitle : shortDay).format(chosen.value);
});
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** Six weeks from the Monday on or before the 1st of the shown month. */
const days = computed(() => {
  const first = monthStart(view.value.year, view.value.month);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const today = iso(new Date());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return {
      date: d,
      key: iso(d),
      inMonth: d.getMonth() === view.value.month,
      today: iso(d) === today,
      chosen: iso(d) === value.value,
    };
  });
});

function show(d: Date): void {
  view.value = { year: d.getFullYear(), month: d.getMonth() };
}

function monthStart(year: number, month: number): Date {
  const date = new Date(0);
  date.setFullYear(year, month, 1);
  return date;
}

function toggle(): void {
  if (!open.value) {
    show(chosen.value ?? new Date());
    draft.value = value.value;
    dateError.value = '';
  }
  open.value = !open.value;
}

function step(months: number): void {
  show(monthStart(view.value.year, view.value.month + months));
}

function pick(day: string): void {
  value.value = day;
  open.value = false;
}

function apply(): void {
  const entered = draft.value.trim();
  try {
    if (entered) parseSettings({ from: entered });
    pick(entered);
  } catch {
    dateError.value = 'Enter a valid date as YYYY-MM-DD, YYYY-MM or YYYY.';
  }
}

function closeOnOutsideClick(event: PointerEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false;
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('pointerdown', closeOnOutsideClick);
  else document.removeEventListener('pointerdown', closeOnOutsideClick);
});
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOnOutsideClick));
</script>

<template>
  <div ref="root" class="date-field" @keydown.esc="open = false">
    <span class="label">{{ props.label }}</span>
    <button
      type="button"
      class="value"
      :class="{ empty: !chosen }"
      :aria-label="`${props.label}: ${value.length === 10 && chosen ? longDay.format(chosen) : shown}`"
      :aria-expanded="open"
      @click="toggle"
    >
      {{ shown }}
    </button>

    <div v-if="open" class="calendar" role="dialog" :aria-label="`Choose the ${props.label} day`">
      <div class="head">
        <button type="button" class="nav" aria-label="Previous month" @click="step(-1)">‹</button>
        <strong>{{ monthTitle.format(monthStart(view.year, view.month)) }}</strong>
        <button type="button" class="nav" aria-label="Next month" @click="step(1)">›</button>
      </div>
      <form class="foot" @submit.prevent="apply">
        <input
          type="text"
          :aria-label="`${props.label} date`"
          placeholder="YYYY-MM-DD, YYYY-MM or YYYY"
          :value="draft"
          :aria-invalid="!!dateError"
          @input="
            draft = ($event.target as HTMLInputElement).value;
            dateError = '';
          "
        />
        <button class="link" type="submit">Apply</button>
      </form>
      <p v-if="dateError" class="error" role="alert">{{ dateError }}</p>
      <div class="grid">
        <span v-for="w in WEEKDAYS" :key="w" class="weekday">{{ w }}</span>
        <button
          v-for="d in days"
          :key="d.key"
          type="button"
          class="day"
          :class="{ outside: !d.inMonth, today: d.today, chosen: d.chosen }"
          :aria-label="longDay.format(d.date)"
          :aria-pressed="d.chosen"
          @click="pick(d.key)"
        >
          {{ d.date.getDate() }}
        </button>
      </div>
      <div class="foot">
        <button type="button" class="link" @click="pick(iso(new Date()))">Today</button>
        <button type="button" class="link" @click="pick('')">Clear</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.date-field {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.label {
  color: var(--muted);
  font-size: 0.85rem;
}

.value {
  min-width: 8.5rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.4rem 0.8rem;
  color: var(--text);
  background: var(--panel);
  text-align: left;
}

.value.empty {
  color: var(--muted);
}

.value[aria-expanded='true'] {
  border-color: var(--accent);
}

.calendar {
  position: absolute;
  top: calc(100% + 0.4rem);
  left: 0;
  z-index: 10;
  width: 17.5rem;
  padding: 0.8rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #121722;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.nav {
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 8px;
  color: var(--text);
  background: transparent;
  font-size: 1.2rem;
}

.nav:hover {
  background: var(--line);
}

.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.15rem;
}

.weekday {
  padding: 0.3rem 0;
  color: var(--muted);
  font-size: 0.75rem;
  text-align: center;
}

.day {
  aspect-ratio: 1;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--text);
  background: transparent;
  font-size: 0.85rem;
}

.day:hover {
  background: var(--line);
}

.day.outside {
  color: #4b5462;
}

.day.today {
  border-color: var(--line);
  font-weight: 700;
}

.day.chosen {
  color: #160a02;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
  font-weight: 700;
}

.foot {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.6rem;
}

.foot input {
  min-width: 0;
  flex: 1;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.4rem;
  background: var(--background);
  color: var(--text);
  font: inherit;
  font-size: 0.75rem;
}
</style>
