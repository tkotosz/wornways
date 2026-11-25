import type { Page } from '@playwright/test';

/** Opens a step from the step bar: its pill, or on a phone its segment ("Go to …"). */
export function openStep(page: Page, name: 'Source' | 'Activities' | 'Video' | 'Export') {
  return page
    .getByRole('navigation', { name: 'Steps' })
    .getByRole('button', { name: new RegExp(`^(Go to )?${name}$`) })
    .filter({ visible: true })
    .first()
    .click();
}

/** Opens a section of the Video step from its section bar. */
export function openSection(page: Page, name: 'Frame' | 'Playback' | 'Map' | 'Overlay' | 'Ending') {
  return page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name, exact: true })
    .click();
}
