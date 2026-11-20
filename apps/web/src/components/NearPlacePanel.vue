<script setup lang="ts">
// One place filter's panel ("starts near" or "ends near"): the place in one field, set by
// typing, the current location or the map, and the slider for how near counts.
import { SETTINGS, type FrequentPlace, type SettingsInput, type TrackEnd } from '@wornways/engine';
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { NearChoice } from '../choice.ts';
import type { EngineClient } from '../engine-client.ts';
import { distanceText } from '../format.ts';

// The map is a large library, so it is loaded only when a panel shows.
const PlacePicker = defineAsyncComponent(() => import('./PlacePicker.vue'));

const props = defineProps<{
  engine: EngineClient;
  end: TrackEnd;
  /** The settings of the period and sports, which choose the activities places are suggested from. */
  suggestFrom: SettingsInput;
  sourceLoaded: boolean;
}>();
const near = defineModel<NearChoice>({ required: true });

const name = props.end === 'start' ? 'Start' : 'End';

function update(change: Partial<NearChoice>): void {
  near.value = { ...near.value, ...change };
}

const position = (lat: number, lon: number) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

/** A stored place, "latitude,longitude", as the field shows it; empty for none. */
function shown(place: string): string {
  const [lat, lon] = place.split(',').map(Number);
  return place ? position(lat!, lon!) : '';
}

// The place: the text as typed, kept apart from the choice until it reads as a place.
const placeText = ref(shown(near.value.place));
const placeError = ref('');
const locating = ref(false);
let locationRequest = 0;
const places = ref<FrequentPlace[]>([]);
/** The radius while the slider is dragged; the choice changes when it is let go. */
const radiusShown = ref(near.value.radius);
/** The radius slider's range, from the settings table. */
const radiusRange = (() => {
  const kind = SETTINGS.find((s) => s.name === `${props.end}-radius`)!.kind;
  return kind.type === 'number' ? kind : { min: 100, max: 20000 };
})();

/** The typed place as the setting takes it, "latitude,longitude"; empty when it is no place. */
function readPlace(text: string): string {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  const [lat, lon] = m ? [Number(m[1]), Number(m[2])] : [NaN, NaN];
  return m && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? `${lat},${lon}` : '';
}

function setPlaceText(text: string): void {
  locationRequest++;
  locating.value = false;
  placeText.value = text;
  const place = readPlace(text);
  placeError.value =
    place || !text.trim() ? '' : 'Write it as latitude, longitude, e.g. 47.4979, 19.0402.';
  update({ place });
}

const setPlace = (lat: number, lon: number) => setPlaceText(position(lat, lon));

/**
 * Sets the place to where the device is. `asked` is false when the app tries this by
 * itself: then a failure stays silent, as the person did not ask for it.
 */
function useCurrentLocation(asked: boolean): void {
  if (!navigator.geolocation) {
    if (asked) placeError.value = 'This browser cannot tell where you are.';
    return;
  }
  locating.value = true;
  const request = ++locationRequest;
  placeError.value = '';
  navigator.geolocation.getCurrentPosition(
    (here) => {
      if (request !== locationRequest) return;
      locating.value = false;
      setPlace(here.coords.latitude, here.coords.longitude);
    },
    (failure) => {
      if (request !== locationRequest) return;
      locating.value = false;
      if (!asked) return;
      placeError.value =
        failure.code === failure.PERMISSION_DENIED
          ? 'The browser was not allowed to tell where you are.'
          : 'Your location could not be found.';
    },
    { enableHighAccuracy: true, timeout: 15_000 },
  );
}

// A panel that opens without a place tries the current location, unless the person has
// refused it before.
onMounted(async () => {
  if (near.value.place || !navigator.geolocation) return;
  const request = locationRequest;
  const permission = await navigator.permissions?.query({ name: 'geolocation' }).catch(() => null);
  if (request === locationRequest && permission?.state !== 'denied') useCurrentLocation(false);
});
onBeforeUnmount(() => locationRequest++);

// The places suggested come from the activities the period and sports choose, so they
// follow those filters. Only the latest request's answer is kept.
let latestPlaces = 0;
watch(
  [() => JSON.stringify(props.suggestFrom), () => props.sourceLoaded],
  async ([settings, loaded]) => {
    const request = ++latestPlaces;
    if (!loaded) {
      places.value = [];
      return;
    }
    const found = await props.engine.places(JSON.parse(settings), props.end).catch(() => []);
    if (request === latestPlaces) places.value = found;
  },
  { immediate: true },
);
</script>

<template>
  <div class="near" :data-testid="`${end}-near`">
    <div class="set-place">
      <input
        type="text"
        inputmode="decimal"
        :aria-label="`${name} place`"
        placeholder="Latitude, longitude"
        :value="placeText"
        @input="setPlaceText(($event.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        class="secondary"
        :disabled="locating"
        @click="useCurrentLocation(true)"
      >
        {{ locating ? 'Finding you…' : 'Use my current location' }}
      </button>
    </div>
    <p v-if="placeError" class="error">{{ placeError }}</p>
    <p v-else-if="!near.place" class="muted">
      Set the place to use this filter: click it on the map, paste a place from a map app as
      latitude, longitude, or use your current location.
    </p>
    <PlacePicker
      :end="end"
      :places="places"
      :place="near.place"
      :radius="radiusShown"
      @pick="setPlace"
    />
    <label class="radius">
      <span>Near means within</span>
      <input
        type="range"
        :min="radiusRange.min"
        :max="radiusRange.max"
        step="100"
        :value="radiusShown"
        :aria-label="`${name} radius`"
        @input="radiusShown = Number(($event.target as HTMLInputElement).value)"
        @change="update({ radius: radiusShown })"
      />
      <strong>{{ distanceText(radiusShown) }}</strong>
    </label>
  </div>
</template>

<style scoped>
.near {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.8rem 1rem;
  border-radius: 12px;
  background: var(--panel);
}

.near p {
  margin: 0;
}

.set-place {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.set-place input {
  flex: 1 1 14rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.55rem 0.8rem;
  color: var(--text);
  background: var(--background);
  font: inherit;
}

.set-place input:focus {
  outline: none;
  border-color: var(--accent);
}

.radius {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.8rem;
  color: var(--muted);
}

.radius input {
  flex: 1 1 10rem;
  accent-color: var(--accent);
}

.radius strong {
  min-width: 4.5rem;
  color: var(--text);
  text-align: right;
}
</style>
