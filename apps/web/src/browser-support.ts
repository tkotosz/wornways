// What the app needs from the browser to make videos.

/** Why this browser cannot make videos; null when it can. */
export function missingSupport(): string | null {
  if (!window.isSecureContext) return 'The app must be opened over HTTPS.';
  if (typeof OffscreenCanvas === 'undefined' || typeof VideoEncoder === 'undefined')
    return (
      'This browser cannot make videos. Use a current version of Chrome or Edge, ' +
      'Firefox on a computer, or Safari 16.4 or later.'
    );
  return null;
}
