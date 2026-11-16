// Draws the app's PNG icons from its SVG marks, for the places that need pixels: the web app
// manifest and the iPhone home screen. Run it after changing a mark:
//
//   npm run icons
//
// mark.svg is the rounded tile; mark-maskable.svg fills the square for systems that crop
// icons to their own shape (Android) or round the corners themselves (iPhone).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ICONS = new URL('../public/icons/', import.meta.url);

const PNGS = [
  { svg: 'mark.svg', png: 'icon-192.png', size: 192 },
  { svg: 'mark.svg', png: 'icon-512.png', size: 512 },
  { svg: 'mark-maskable.svg', png: 'icon-maskable-512.png', size: 512 },
  { svg: 'mark-maskable.svg', png: 'apple-touch-icon.png', size: 180 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { svg, png, size } of PNGS) {
  const source = readFileSync(new URL(svg, ICONS), 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>body { margin: 0 } svg { display: block; width: ${size}px; height: ${size}px }</style>` +
      source,
  );
  await page.screenshot({ path: fileURLToPath(new URL(png, ICONS)), omitBackground: true });
  console.log(`${png} (${size} px)`);
}
await browser.close();
