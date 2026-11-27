// The phone's back gesture, and the browser's Back, close what is open over the editor
// instead of leaving the site. Each layer open (a popup, the menu, a page opened from the
// menu) is an entry in the browser's history: opening one adds an entry, closing it from the
// page goes back over it, and going back closes the top one. A layer that cannot close yet
// (a popup with nothing behind it) takes its entry back.

import { onBeforeUnmount, watch, type Ref } from 'vue';

export function useBackGesture(layers: Ref<number>, closeTop: () => void): void {
  /** How many entries of the page's own the history holds up to where it is now. */
  let depth = layersOf(history.state);

  /** Adds or goes back over entries until there is one per layer open. */
  function sync(): void {
    const wanted = layers.value;
    while (depth < wanted) history.pushState({ layers: ++depth }, '');
    if (depth > wanted) {
      const back = depth - wanted;
      depth = wanted;
      history.go(-back);
    }
  }

  function popped(event: PopStateEvent): void {
    depth = layersOf(event.state);
    if (depth < layers.value) closeTop();
    sync();
  }

  watch(layers, sync);
  window.addEventListener('popstate', popped);
  onBeforeUnmount(() => window.removeEventListener('popstate', popped));
}

function layersOf(state: unknown): number {
  const layers = (state as { layers?: unknown } | null)?.layers;
  return typeof layers === 'number' ? layers : 0;
}
