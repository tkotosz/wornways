import { expect, type Page } from '@playwright/test';

type SectionName = 'Frame' | 'Playback' | 'Map' | 'Overlay' | 'Ending';

/** Opens a step from the step bar's pills (wide screens). */
export function openStep(page: Page, name: 'Source' | 'Activities' | 'Design' | 'Export') {
  return page
    .getByRole('navigation', { name: 'Steps' })
    .getByRole('button', { name, exact: true })
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

/**
 * Picks the Activities step's period, which it starts without: the list of activities and
 * the way on come once one is picked.
 */
export function pickPeriod(page: Page, label = 'All time') {
  return page.getByRole('button', { name: label, exact: true }).click();
}

/**
 * Picks how the video plays, which the Design step asks first each time it comes after
 * Activities: the style named, else the first one offered (the one a video starts with).
 */
export async function chooseStyle(page: Page, name?: string) {
  const chooser = page.getByRole('region', { name: 'How should it play?' });
  const card = name
    ? chooser.getByRole('button', { name: new RegExp(`^${name}`) })
    : chooser.getByRole('button').first();
  await card.click();
}
