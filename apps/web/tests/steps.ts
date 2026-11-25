import { expect, type Page } from '@playwright/test';

type SectionName = 'Frame' | 'Playback' | 'Map' | 'Overlay' | 'Ending';

/** Opens a step from the step bar: its pill, or on a phone its segment ("Go to …"). */
export function openStep(page: Page, name: 'Source' | 'Activities' | 'Design' | 'Export') {
  return page
    .getByRole('navigation', { name: 'Steps' })
    .getByRole('button', { name: new RegExp(`^(Go to )?${name}$`) })
    .filter({ visible: true })
    .first()
    .click();
}

/** Opens a section of the Design step from its section bar. */
export function openSection(page: Page, name: SectionName) {
  return page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name, exact: true })
    .click();
}

/** Expects the Design step to be open on a section: its button in the bar is the current one. */
export function expectSection(page: Page, name: SectionName) {
  return expect(
    page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name, exact: true }),
  ).toHaveAttribute('aria-current', 'step');
}
