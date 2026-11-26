<script setup lang="ts">
// A place on a map, for a "starts near" or "ends near" filter: the place with a circle
// showing how near counts, and the places most activities start (or end) at as numbered
// markers and as a list. A click anywhere on the map, a marker, a list entry or dragging
// the place's marker sets the place. The map is drawn with MapLibre and OpenFreeMap's dark
// style; this component is loaded only when it is shown.
import type { FrequentPlace, TrackEnd } from '@wornways/engine';
import { MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre draws in a worker of its own. Its file imports a shared chunk by a path that
// bundling breaks, so Vite bundles the worker into one file and MapLibre is told where.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  /** Whether the place is for the activities' start or their end. */
  end: TrackEnd;
  places: FrequentPlace[];
  /** The place as "latitude,longitude"; empty when not set. */
  place: string;
  /** How near counts, in meters. */
  radius: number;
}>();
const emit = defineEmits<{ pick: [lat: number, lon: number] }>();

setWorkerUrl(mapWorkerUrl);

const STYLE = 'https://tiles.openfreemap.org/styles/dark';
/** Room around the place's circle when the map zooms to it, in pixels. */
const CIRCLE_PADDING = 40;

/** The two GeoJSON shapes the map draws: the circle around the place, or nothing. */
type Circle = {
  type: 'Feature';
  properties: Record<string, never>;
  geometry: { type: 'Polygon'; coordinates: number[][][] };
};
type Nothing = { type: 'FeatureCollection'; features: [] };
const NOTHING: Nothing = { type: 'FeatureCollection', features: [] };
type Bounds = [[number, number], [number, number]];

const container = ref<HTMLElement | null>(null);
const failed = ref('');
let map: MapLibreMap | null = null;
let placeMarker: Marker | null = null;
let suggestionMarkers: Marker[] = [];
/** Set while the place changes by a click or drag on the map, which keeps the view. */
let pickedOnMap = false;

const parsePlace = (place: string) => {
  const [lat, lon] = place.split(',').map(Number);
  return place && Number.isFinite(lat) && Number.isFinite(lon) ? { lat: lat!, lon: lon! } : null;
};

/** "start" and "starts", or "end" and "ends", for the counts of the suggestions. */
const word = (count: number) => (count === 1 ? props.end : `${props.end}s`);

const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });
const span = (p: FrequentPlace) => {
  const [a, b] = [monthYear.format(p.first), monthYear.format(p.last)];
  return a === b ? a : `${a} – ${b}`;
};

/** The ring of points `radius` meters around the point, as [longitude, latitude] pairs. */
function ring(lat: number, lon: number, radius: number): number[][] {
  const perLat = 111_320;
  const perLon = perLat * Math.cos((lat * Math.PI) / 180);
  return Array.from({ length: 65 }, (_, i) => {
    const angle = (i / 64) * 2 * Math.PI;
    return [lon + (radius * Math.cos(angle)) / perLon, lat + (radius * Math.sin(angle)) / perLat];
  });
}

const boundsOf = (points: number[][]): Bounds => {
  const lons = points.map((p) => p[0]!);
  const lats = points.map((p) => p[1]!);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
};

function pick(lat: number, lon: number, onMap: boolean): void {
  pickedOnMap = onMap;
  emit('pick', lat, lon);
}

/** Moves the place's marker and the circle to the current place and radius. */
function showPlace(): void {
  if (!map) return;
  const place = parsePlace(props.place);
  const source = map.getSource('near-place') as
    { setData(data: Circle | Nothing): void } | undefined;
  source?.setData(
    place
      ? {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [ring(place.lat, place.lon, props.radius)] },
        }
      : NOTHING,
  );
  if (!place) {
    placeMarker?.remove();
    placeMarker = null;
    return;
  }
  if (!placeMarker) {
    const element = document.createElement('div');
    element.className = 'chosen-marker';
    element.title = 'The chosen place: drag to move';
    placeMarker = new Marker({ element, draggable: true })
      .setLngLat([place.lon, place.lat])
      .addTo(map);
    placeMarker.on('dragend', () => {
      const at = placeMarker!.getLngLat();
      pick(at.lat, at.lng, true);
    });
  } else placeMarker.setLngLat([place.lon, place.lat]);
}

/** Zooms to the place and its circle; without a place, to the suggested places. */
function frame(animate: boolean): void {
  if (!map) return;
  const place = parsePlace(props.place);
  const options = { padding: CIRCLE_PADDING, maxZoom: 16, duration: animate ? 600 : 0 };
  if (place) map.fitBounds(boundsOf(ring(place.lat, place.lon, props.radius)), options);
  else if (props.places.length)
    map.fitBounds(boundsOf(props.places.map((p) => [p.lon, p.lat])), { ...options, maxZoom: 13 });
}

function showSuggestions(): void {
  if (!map) return;
  for (const marker of suggestionMarkers) marker.remove();
  suggestionMarkers = props.places.map((place, i) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'place-marker';
    element.textContent = String(i + 1);
    element.title = `${place.count} ${place.count === 1 ? 'activity' : 'activities'} ${props.end === 'start' ? 'started' : 'ended'} here (${span(place)})`;
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      pick(place.lat, place.lon, true);
    });
    return new Marker({ element }).setLngLat([place.lon, place.lat]).addTo(map!);
  });
}

onMounted(() => {
  try {
    map = new MapLibreMap({
      container: container.value!,
      style: STYLE,
      center: [19, 47.5],
      zoom: 4,
      // The credit is a line of small text of the page's own, under the map's controls.
      attributionControl: false,
    });
  } catch (error) {
    failed.value = `The map cannot be shown in this browser (${error instanceof Error ? error.message : error}). Pick a place from the list instead.`;
    return;
  }
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  frame(false);
  map.on('load', () => {
    map!.addSource('near-place', { type: 'geojson', data: NOTHING });
    map!.addLayer({
      id: 'near-place-fill',
      type: 'fill',
      source: 'near-place',
      paint: { 'fill-color': '#ff8a2a', 'fill-opacity': 0.15 },
    });
    map!.addLayer({
      id: 'near-place-line',
      type: 'line',
      source: 'near-place',
      paint: { 'line-color': '#ff8a2a', 'line-width': 2 },
    });
    showPlace();
  });
  showSuggestions();
  map.on('click', (event) => pick(event.lngLat.lat, event.lngLat.lng, true));
});

// A place set from outside the map (typed, current location, the list) or a new radius
// brings the place and its circle into view; a click or drag on the map keeps the view.
watch(
  () => [props.place, props.radius],
  () => {
    showPlace();
    if (!pickedOnMap) frame(true);
    pickedOnMap = false;
  },
);
watch(
  () => props.places,
  () => {
    showSuggestions();
    if (!parsePlace(props.place)) frame(true);
  },
);
onBeforeUnmount(() => map?.remove());
</script>

<template>
  <div class="picker">
    <div v-if="!failed" class="frame">
      <div ref="container" class="map" data-testid="place-map" />
      <!-- The credit the map's data asks for, always in view, as on the video. -->
      <p class="credit">
        <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>&#32;<a
          href="https://www.openmaptiles.org/"
          target="_blank"
          rel="noopener"
          >© OpenMapTiles</a
        >
        Data from
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener"
          >OpenStreetMap</a
        >
      </p>
    </div>
    <p v-else class="muted">{{ failed }}</p>
    <div v-if="places.length" class="places">
      <span class="muted">Where your activities {{ end }} most often:</span>
      <ol>
        <li v-for="(p, i) in places" :key="`${p.lat},${p.lon}`">
          <button type="button" class="place" @click="pick(p.lat, p.lon, false)">
            <span class="number">{{ i + 1 }}</span>
            {{ p.count.toLocaleString('en-US') }} {{ word(p.count) }} ·
            {{ span(p) }}
          </button>
        </li>
      </ol>
    </div>
    <p class="muted hint">Click the map or a place to set it; drag the marker to adjust it.</p>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.frame {
  position: relative;
}

.map {
  height: 340px;
  border-radius: 12px;
  overflow: hidden;
}

/* One line of small text at the bottom of the map, readable over it with a soft shadow. */
.credit {
  position: absolute;
  right: 0.5rem;
  bottom: 0.3rem;
  left: 0.5rem;
  margin: 0;
  color: rgb(255 255 255 / 70%);
  font-size: 0.62rem;
  line-height: 1.3;
  text-align: right;
  text-shadow: 0 0 3px #000;
  pointer-events: none;
}

.credit a {
  color: inherit;
  text-decoration: none;
  pointer-events: auto;
}

.credit a:hover {
  text-decoration: underline;
}

.places ol {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
}

.place {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.3rem 0.8rem 0.3rem 0.35rem;
  color: var(--text);
  background: transparent;
}

.place:hover {
  border-color: var(--accent);
}

.number {
  display: inline-grid;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  color: var(--text);
  background: #2a3240;
  font-size: 0.75rem;
  font-weight: 700;
}

.hint {
  margin: 0;
  font-size: 0.85rem;
}

/* The zoom buttons, in the app's dark style instead of MapLibre's white. */
:global(.maplibregl-ctrl-group) {
  background: #121722;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12);
}

:global(.maplibregl-ctrl-group button + button) {
  border-top-color: rgba(255, 255, 255, 0.12);
}

:global(.maplibregl-ctrl-group .maplibregl-ctrl-icon) {
  filter: invert(1);
}

/* Markers live inside the map, outside this component's scope. */
:global(.place-marker) {
  width: 1.6rem;
  height: 1.6rem;
  border: 2px solid #0b0e14;
  border-radius: 50%;
  color: #eef1f5;
  background: #2a3240;
  font:
    700 0.75rem/1 Inter,
    system-ui,
    sans-serif;
  cursor: pointer;
}

:global(.chosen-marker) {
  width: 1.4rem;
  height: 1.4rem;
  border: 3px solid #0b0e14;
  border-radius: 50%;
  background: linear-gradient(90deg, #ff8a2a, #ff5a1f);
  box-shadow: 0 0 0 3px rgba(255, 138, 42, 0.35);
  cursor: grab;
}
</style>
