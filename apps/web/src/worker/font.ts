// The font videos are drawn with, shipped with the app so every device draws the same text.
// Inter, under the SIL Open Font License (public/fonts/Inter-LICENSE.txt).

let loaded: Promise<void> | null = null;

/** Makes the font available to canvases in this worker; loads it once. */
export function loadFont(): Promise<void> {
  loaded ??= (async () => {
    const response = await fetch(new URL('/fonts/InterVariable.woff2', self.location.origin));
    if (!response.ok) throw new Error(`could not load the font (HTTP ${response.status})`);
    const face = new FontFace('Inter', await response.arrayBuffer(), { weight: '100 900' });
    await face.load();
    (self as unknown as { fonts: FontFaceSet }).fonts.add(face);
  })();
  return loaded;
}
