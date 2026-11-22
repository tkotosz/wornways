<script setup lang="ts">
// Something is loading whose length is not known, such as an activity list: the text and a
// bar that keeps moving.
defineProps<{ text: string }>();
</script>

<template>
  <div class="loading" role="status" data-testid="loading">
    <strong>{{ text }}</strong>
    <div class="bar" aria-hidden="true"><div /></div>
  </div>
</template>

<style scoped>
.loading {
  display: grid;
  gap: 0.6rem;
  margin: 1rem 0;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel);
}

.source-content .loading {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
}

.bar {
  position: relative;
  height: 6px;
  border-radius: 3px;
  background: var(--line);
  overflow: hidden;
}

.bar div {
  position: absolute;
  inset: 0 auto 0 0;
  width: 35%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--accent), var(--accent-strong));
  animation: slide 1.2s ease-in-out infinite;
}

@keyframes slide {
  from {
    left: -35%;
  }
  to {
    left: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bar div {
    animation: none;
    width: 100%;
    opacity: 0.5;
  }
}
</style>
