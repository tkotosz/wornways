// Reporting an issue: the project's GitHub page for a new issue, where the person picks a
// bug report or an idea (.github/ISSUE_TEMPLATE). The app version and the kind of device
// and browser are filled in, from the form fields of the same id; nothing else about the
// person or their activities is sent, and they see all of it before submitting.

const NEW_ISSUE = 'https://github.com/tkotosz/wornways/issues/new/choose';

/** The kind of device, from the browser's user agent. iPadOS says Mac, but has touch. */
function deviceOf(agent: string, touch: boolean): string {
  if (/iPhone/.test(agent)) return 'iPhone';
  if (/iPad/.test(agent) || (/Macintosh/.test(agent) && touch)) return 'iPad';
  if (/Android/.test(agent)) return /Mobile/.test(agent) ? 'Android phone' : 'Android tablet';
  if (/Windows/.test(agent)) return 'Windows';
  if (/Macintosh/.test(agent)) return 'Mac';
  if (/Linux|X11/.test(agent)) return 'Linux';
  return 'Other device';
}

/**
 * The browser, from its user agent. The order matters: Edge and Samsung Internet also say
 * Chrome, and Chrome also says Safari.
 */
function browserOf(agent: string): string {
  if (/Edg\//.test(agent)) return 'Edge';
  if (/SamsungBrowser/.test(agent)) return 'Samsung Internet';
  if (/Firefox|FxiOS/.test(agent)) return 'Firefox';
  if (/Chrome|CriOS/.test(agent)) return 'Chrome';
  if (/Safari/.test(agent)) return 'Safari';
  return 'other browser';
}

/**
 * The kind of device, the browser and whether the app is installed, without versions:
 * "Android phone, Chrome, installed app".
 */
export function deviceSummary(agent: string, installed: boolean, touch: boolean): string {
  const where = installed ? 'installed app' : 'in the browser';
  return `${deviceOf(agent, touch)}, ${browserOf(agent)}, ${where}`;
}

/** The page for a new issue, with this version and this device (`deviceSummary`) filled in. */
export function reportUrl(version: string, device: string): string {
  return `${NEW_ISSUE}?${new URLSearchParams({ version, device })}`;
}
