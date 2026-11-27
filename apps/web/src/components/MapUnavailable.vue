<script setup lang="ts">
// In place of the place filter's map when its code could not be fetched: most often because
// the app was updated while this page was open, and the page asks for the file of the version
// it started with. A reload loads the current one. The place can still be typed meanwhile.
function reload(): void {
  window.location.reload();
}
</script>

<template>
  <div class="unavailable" data-testid="map-unavailable">
    <p class="muted">
      The map could not be loaded; the app may have been updated since this page opened. Reload to
      show it, or type the place above meanwhile.
    </p>
    <button type="button" class="secondary" @click="reload">Reload</button>
  </div>
</template>

<style scoped>
.unavailable {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  padding: 0.8rem;
  border: 1px dashed var(--line);
  border-radius: 12px;
}

.unavailable p {
  flex: 1 1 14rem;
  margin: 0;
}
</style>
