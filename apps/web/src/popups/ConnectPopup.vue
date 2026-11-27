<script setup lang="ts">
// Connecting Strava or Ride with GPS, when it is picked and not connected: what the
// connection allows, and the service's own Connect button, which leaves for its sign-in page
// and comes back to choosing the activities. At the top the source, with Switch source beside
// it to pick another one instead.
import { computed, ref } from 'vue';
import AppPopup from '../components/AppPopup.vue';
import LoadingStatus from '../components/LoadingStatus.vue';
import SourceCard from '../components/SourceCard.vue';
import { rememberStravaState } from '../strava-auth.ts';
import { SOURCE_NAMES } from '../sources.ts';
import { CONNECT_URL } from '../use-ridewithgps.ts';

const props = defineProps<{
  source: 'strava' | 'rwgps';
  closable: boolean;
  stravaUrl: URL | null;
  /** Whether the person came back from Strava's sign-in page without Strava's answer. */
  stravaUnanswered: boolean;
  /** What is loading, and what went wrong, with the service. */
  busy: string;
  error: string;
}>();
const emit = defineEmits<{ close: []; menu: []; switch: []; files: [] }>();

const title = computed(() => `Connect ${SOURCE_NAMES[props.source]}`);
const storageError = ref('');

function authorize(event: MouseEvent): void {
  try {
    if (props.stravaUrl) rememberStravaState(props.stravaUrl);
  } catch {
    event.preventDefault();
    storageError.value = 'Allow session storage in this browser to connect to Strava.';
  }
}
</script>

<template>
  <AppPopup :title="title" :closable="closable" @close="emit('close')" @menu="emit('menu')">
    <SourceCard :source="source" note="Not connected" @switch="emit('switch')" />
    <div v-if="source === 'strava'" class="screen" data-testid="strava-source">
      <LoadingStatus v-if="busy" :text="busy" />
      <template v-else>
        <p class="muted">
          Your Strava activities. Tracks are downloaded when a video needs them and kept on this
          device for up to two hours after you connect.
        </p>
        <!-- Strava shows some refusals on its own page and never sends the person back. -->
        <div v-if="stravaUnanswered" class="unanswered" data-testid="strava-unanswered">
          <p role="status">
            Strava did not connect. If Strava said “Limit of connected athletes exceeded”, Strava
            lets no more people connect to Wornways for now. Use your Strava export ZIP instead: it
            holds all your activities.
          </p>
          <button type="button" class="secondary" @click="emit('files')">Use files instead</button>
        </div>
        <a v-if="stravaUrl" :href="stravaUrl.href" class="strava-connect" @click="authorize">
          <img src="/strava-connect.svg" alt="Connect with Strava" width="237" height="48" />
        </a>
        <p v-if="!stravaUnanswered" class="muted small">
          If Strava says its connection limit was reached, use activity files instead.
        </p>
        <p class="muted small">
          <a class="link" href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>
          · Wornways reads activity names, dates, sports, distance, and GPS tracks. Manage access in
          <a
            class="link"
            href="https://www.strava.com/settings/apps"
            target="_blank"
            rel="noopener noreferrer"
            >Strava settings</a
          >.
        </p>
      </template>
    </div>

    <div v-else class="screen" data-testid="rwgps-source">
      <LoadingStatus v-if="busy" :text="busy" />
      <template v-else>
        <p class="muted">
          Your Ride with GPS trips. Tracks are downloaded when a video needs them and kept on this
          device until you disconnect.
        </p>
        <a :href="CONNECT_URL" class="primary connect">Connect Ride with GPS</a>
        <p class="muted small">
          <a class="link" href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>
          · Wornways reads trip names, dates, sports, distances, and GPS tracks, and never changes
          your account.
        </p>
      </template>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="storageError" class="error" role="alert">{{ storageError }}</p>
  </AppPopup>
</template>

<style scoped>
.screen {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.screen p {
  margin: 0;
}

.screen > button,
.connect,
.strava-connect {
  align-self: start;
}

.connect {
  text-decoration: none;
}

.small {
  font-size: 0.85rem;
}

.strava-connect {
  max-width: 100%;
}

.strava-connect img {
  display: block;
  max-width: 100%;
  height: auto;
}

.unanswered {
  display: flex;
  flex-direction: column;
  align-items: start;
  gap: 0.7rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel);
}
</style>
