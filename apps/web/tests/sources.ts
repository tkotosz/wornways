import type { Page } from '@playwright/test';
import type { Source } from '../src/messages.ts';

/** Picks a source in the Source step's list, as on a first visit or after going back to it. */
export async function pickSource(page: Page, source: Source): Promise<void> {
  await page.getByTestId(`choose-${source}`).click();
}

/**
 * Goes back to the list of sources, which clears the choice: from a source's own screen by
 * its way back ("← Sources"), from Activities by "Change source".
 */
export async function backToSources(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^(Back to Sources|Change source)$/ }).click();
}
