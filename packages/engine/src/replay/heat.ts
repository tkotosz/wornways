// Heat: how many times routes pass over each pixel, mapped onto a colour ramp.
//
// Canvas 2D only offers 8-bit channels, so passes are counted in three channels at once
// with additive blending, each at a different resolution. Red counts 32 per pass (fine
// detail up to 8 passes), green 4 per pass (up to 64), blue 1 per pass (up to 255).
// Reading back the first channel that has not saturated gives the count with precision
// where it matters and range where it is needed.

/** Additive stroke colour that adds `value` passes (glow strokes add a fraction of one). */
export function heatStyle(value: number): string {
  return `rgba(32, 4, 1, ${value.toFixed(4)})`;
}

/** Number of distinct encoded values: red 0-254, then green 0-254, then blue 0-255. */
const LUT_SIZE = 255 + 255 + 256;

function lutIndex(r: number, g: number, b: number): number {
  return r < 255 ? r : g < 255 ? 255 + g : 510 + b;
}

function passesAt(index: number): number {
  if (index < 255) return index / 32;
  if (index < 510) return Math.max(255 / 32, (index - 255) / 4);
  return Math.max(255 / 4, index - 510);
}

/** Passes at each pixel of RGBA data read back from a heat canvas. */
export function decodeHeat(data: Uint8ClampedArray, out: Float32Array): void {
  for (let i = 0, j = 0; j < out.length; i += 4, j++)
    out[j] = passesAt(lutIndex(data[i], data[i + 1], data[i + 2]));
}

/** The pass count that should show as the hottest colour: a high percentile of route pixels. */
export function saturationFromHeat(passes: Float32Array, percentile = 0.97): number {
  const onRoute: number[] = [];
  for (let i = 0; i < passes.length; i++) if (passes[i] >= 0.9) onRoute.push(passes[i]);
  if (onRoute.length === 0) return 3;
  onRoute.sort((a, b) => a - b);
  return Math.max(3, onRoute[Math.floor((onRoute.length - 1) * percentile)]);
}

/** Colour stops: position on the ramp, then r, g, b, alpha. */
const RAMP: [number, number, number, number, number][] = [
  [0.0, 150, 30, 10, 0],
  [0.05, 210, 50, 15, 0.45],
  [0.2, 255, 85, 25, 0.95],
  [0.45, 255, 140, 35, 1],
  [0.75, 255, 205, 90, 1],
  [1.0, 255, 250, 225, 1],
];

function rampAt(x: number): [number, number, number, number] {
  for (let i = 1; i < RAMP.length; i++) {
    const [x1, ...c1] = RAMP[i];
    if (x > x1 && i < RAMP.length - 1) continue;
    const [x0, ...c0] = RAMP[i - 1];
    const f = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
    return [0, 1, 2, 3].map((k) => c0[k] + f * (c1[k] - c0[k])) as [number, number, number, number];
  }
  return [0, 0, 0, 0];
}

/**
 * Maps encoded heat to colour. One pass always gets the same orange; the ramp then runs on
 * a log scale up to white at `saturation` passes, so busy roads stand out without the
 * quieter ones fading away.
 */
export type HeatRamp = {
  /** Per encoded value: premultiplied r, g, b, then 1 - alpha. */
  lut: Float32Array;
  saturation: number;
};

export function createHeatRamp(saturation: number): HeatRamp {
  const lut = new Float32Array(LUT_SIZE * 4);
  const logSat = Math.log(Math.max(saturation, 1.5));
  for (let i = 0; i < LUT_SIZE; i++) {
    const h = passesAt(i);
    const x = h < 1 ? 0.2 * h : Math.min(1, 0.2 + (0.8 * Math.log(h)) / logSat);
    const [r, g, b, a] = rampAt(x);
    lut.set([r * a, g * a, b * a, 1 - a], i * 4);
  }
  return { lut, saturation };
}

/**
 * Writes map + coloured heat into `heat` (RGBA read back from a heat canvas), in place.
 * `map` holds the map's pixels for the same rectangle of a canvas `mapWidth` pixels wide.
 */
export function composeHeat(
  ramp: HeatRamp,
  heat: Uint8ClampedArray,
  rectW: number,
  rectH: number,
  map: Uint8ClampedArray,
  mapWidth: number,
  rectX: number,
  rectY: number,
): void {
  const lut = ramp.lut;
  for (let y = 0; y < rectH; y++) {
    let i = y * rectW * 4;
    let m = ((rectY + y) * mapWidth + rectX) * 4;
    for (let x = 0; x < rectW; x++, i += 4, m += 4) {
      const r = heat[i];
      const k = (r < 255 ? r : heat[i + 1] < 255 ? 255 + heat[i + 1] : 510 + heat[i + 2]) * 4;
      const inv = lut[k + 3];
      heat[i] = map[m] * inv + lut[k];
      heat[i + 1] = map[m + 1] * inv + lut[k + 1];
      heat[i + 2] = map[m + 2] * inv + lut[k + 2];
      heat[i + 3] = 255;
    }
  }
}
