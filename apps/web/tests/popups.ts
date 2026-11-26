// Helpers for the browser tests: the way to the editor through its popups, and the editor's
// sections.
import { expect, type Page } from '@playwright/test';
import type { Source } from '../src/messages.ts';

type SectionName = 'Frame' | 'Playback' | 'Map' | 'Overlay' | 'Ending';

/** Picks a source in the list of sources: open on a first visit, or after Switch source. */
export function pickSource(page: Page, source: Source) {
  return page.getByTestId(`choose-${source}`).click();
}

/**
 * Opens the list of sources from the menu: the top bar's, or that of a popup that cannot close
 * yet.
 */
export async function switchSource(page: Page) {
  await openMenu(page);
  await page.getByRole('button', { name: /^Switch source/ }).click();
}

/** Opens the menu: from the popup open, when it cannot close yet, else from the top bar. */
export async function openMenu(page: Page) {
  // Once the app has loaded: a popup open, or the editor.
  const popup = page.locator('dialog[open]');
  await expect(popup.or(page.getByRole('navigation', { name: 'Sections' })).first()).toBeVisible();
  const inPopup = popup.getByRole('button', { name: 'Menu' });
  const menu = (await inPopup.count())
    ? inPopup
    : page.getByTestId('top-bar').getByRole('button', { name: 'Menu' });
  await menu.click();
}

/** Picks the period, which the files and the demo start without. */
export function pickPeriod(page: Page, label = 'All time') {
  return page.getByRole('button', { name: label, exact: true }).click();
}

/** The activities popup. */
export const activitiesPopup = (page: Page) =>
  page.getByRole('dialog', { name: 'Choose your activities' });

/** The activities popup's button that takes the activities ticked to the editor. */
export const useButton = (page: Page) =>
  activitiesPopup(page).getByRole('contentinfo').getByRole('button');

/** On the way in with files: on from adding them to choosing the activities. */
export function toActivities(page: Page) {
  return page
    .getByRole('dialog', { name: 'Files on this device' })
    .getByRole('button', { name: 'Choose activities' })
    .click();
}

/** Takes the activities ticked to the editor. */
export function useActivities(page: Page) {
  return activitiesPopup(page)
    .getByRole('button', { name: /^Use \d+ activit/ })
    .click();
}

/** Opens the activities from the top bar. */
export function openActivities(page: Page) {
  return page.getByRole('button', { name: /^Activities: / }).click();
}

/** The preset popup. */
export const presetPopup = (page: Page) =>
  page.getByRole('dialog', { name: 'How should it play?' });

/** The preset cards, named by the preset. */
const PRESET_CARD = /^(All at once|Recap|Multiday trip|Highlight|Keep my own playback)/;

/** Picks how the video plays: the preset named, else the first one offered. */
export async function chooseStyle(page: Page, name?: string) {
  const cards = presetPopup(page).getByRole('button', {
    name: name ? new RegExp(`^${name}`) : PRESET_CARD,
  });
  await cards.first().click();
}

/**
 * Opens the editor on the demo's activities of all time, playing as the preset named (else
 * the first one offered).
 */
export async function openDemo(page: Page, preset?: string) {
  await page.goto('/');
  await pickSource(page, 'demo');
  await pickPeriod(page);
  await useActivities(page);
  await chooseStyle(page, preset);
}

/** Makes the video: Render in the top bar opens it, made at once. */
export function render(page: Page) {
  return page.getByRole('button', { name: 'Render', exact: true }).click();
}

/** The render popup. */
export const renderPopup = (page: Page) => page.getByRole('dialog', { name: 'Your video' });

/** Opens a section of the editor from its section bar. */
export function openSection(page: Page, name: SectionName) {
  return page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name, exact: true })
    .click();
}

/** Expects the editor to be open on a section: its button in the bar is the current one. */
export function expectSection(page: Page, name: SectionName) {
  return expect(
    page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name, exact: true }),
  ).toHaveAttribute('aria-current', 'step');
}
