import type { Page } from '@playwright/test';
import type { Source } from '../src/messages.ts';

/** Picks a source in the Source step's list, as on a first visit or after "Change source". */
export async function pickSource(page: Page, source: Source): Promise<void> {
  await page.getByTestId(`choose-${source}`).click();
}
