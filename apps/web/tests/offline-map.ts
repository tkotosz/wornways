import type { BrowserContext } from '@playwright/test';

/**
 * Answers map requests without the network: a tile address template, and an empty
 * response for every tile (as for open sea). Returns how many requests it answered.
 */
export async function offlineMap(context: BrowserContext): Promise<() => number> {
  let requests = 0;
  await context.route('https://tiles.openfreemap.org/**', async (route) => {
    requests++;
    if (route.request().url().endsWith('/planet'))
      return route.fulfill({
        json: { tiles: ['https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf'] },
      });
    return route.fulfill({ status: 204 });
  });
  return () => requests;
}
