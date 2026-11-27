<script setup lang="ts">
// What the demo holds and what to try with it, shown above the filters while the demo is
// open. The dates and names match the demo's activities (see apps/cli/src/demo/mallorca.ts).
</script>

<template>
  <aside class="guide" data-testid="demo-guide">
    <p>
      The demo has 25 made-up activities on real roads in Mallorca: 14 rides and 6 runs from Port de
      Pollença in April 2026, and a five-day tour of the island from 4 to 8 May 2026.
    </p>
    <p class="try">Things to try:</p>
    <ul>
      <li>
        <strong>Recap:</strong> pick All time, keep everything ticked and pick Recap. The weeks play
        one after another.
      </li>
      <li>
        <strong>Multiday trip:</strong> set the period to Custom, from 4 May to 8 May 2026, then
        pick Multiday trip. The camera follows the tour day by day.
      </li>
      <li>
        <strong>Highlight:</strong> pick All time, untick everything with the box at the top of the
        list, then tick only Sa Calobra (18 April, 104 km). A single activity plays as a 15-second
        clip.
      </li>
      <li>
        <strong>All at once:</strong> pick All time, keep everything ticked and pick All at once.
        Every ride and run starts at the same moment.
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.guide {
  margin: 0.75rem 0 1.25rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  font-size: 0.9rem;
  line-height: 1.5;
}

.guide p {
  margin: 0;
}

.guide .try {
  margin-top: 0.6rem;
}

.guide ul {
  margin: 0.3rem 0 0;
  padding-left: 1.2rem;
}

.guide li + li {
  margin-top: 0.3rem;
}
</style>
