<script setup lang="ts">
// How to get activity files out of Strava and Garmin.
//
// Checked 2026-11-16: Strava's steps from its help page
// (https://support.strava.com/hc/en-us/articles/216918437-Exporting-your-Data-and-Bulk-Export);
// Garmin's export page needs a sign-in, so its steps stay general: the address is Garmin's.
// The layout of the download (activity files in ZIP files inside the ZIP, the activity list
// in DI-Connect-Fitness) was checked against a real export on 2026-11-17.
import ModalPanel from './ModalPanel.vue';
</script>

<template>
  <ModalPanel title="How to get your files">
    <template #trigger="{ open }">
      <button type="button" class="link guide-link" aria-haspopup="dialog" @click="open">
        How to get your files
      </button>
    </template>
    <h3>From Strava, all at once</h3>
    <ol>
      <li>
        On the Strava website (not the app), open Settings, then My Account. Under "Download your
        account", choose Get Started, then Request download.
      </li>
      <li>Strava emails you a link to a ZIP file, which may take a few hours.</li>
      <li>
        Add that ZIP here as it is, without unpacking it. The names and sports of your activities
        come from the list inside it.
      </li>
    </ol>

    <h3>From Garmin, all at once</h3>
    <ol>
      <li>
        Sign in to your Garmin account and ask for a copy of your data on its
        <a
          class="link"
          href="https://www.garmin.com/account/datamanagement/exportdata/"
          target="_blank"
          rel="noopener"
          >Export Your Data</a
        >
        page.
      </li>
      <li>Garmin emails you a link to a ZIP file; this can take a few days.</li>
      <li>
        Add that ZIP here as it is, without unpacking it. The names and sports of your activities
        come from the list inside it; your watch's daily health data is left out.
      </li>
    </ol>

    <h3>One activity</h3>
    <p>
      On Strava's website, an activity's ⋯ menu offers Export Original and Export GPX; in Garmin
      Connect, an activity's gear menu offers Export File. Wornways reads FIT, GPX and TCX files,
      also compressed (.gz).
    </p>
  </ModalPanel>
</template>

<style scoped>
.guide-link {
  align-self: start;
  margin-top: 0.65rem;
  padding: 0.25rem 0;
  font-size: 0.85rem;
}

h3 {
  margin: 1.1rem 0 0.4rem;
  color: var(--text);
  font-size: 0.95rem;
}

h3:first-child {
  margin-top: 0;
}

ol {
  margin: 0;
  padding-left: 1.3rem;
}

li + li {
  margin-top: 0.3rem;
}

p {
  margin: 0;
}
</style>
