// A cookie whose value only this deployment can read: the contents are encrypted with
// AES-GCM under a key derived from a server secret, and bound to the deployment origin.

const bytes = new TextEncoder();
const base64url = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromBase64url = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));

/** `label` keeps keys for different cookies apart even when they share a secret. */
async function key(secret: string, label: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest('SHA-256', bytes.encode(label + ':' + secret));
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** The cookie's value with `contents` encrypted: `<iv>.<ciphertext>`, both base64url. */
export async function seal(
  contents: unknown,
  secret: string,
  label: string,
  origin: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: bytes.encode(origin) },
    await key(secret, label),
    bytes.encode(JSON.stringify(contents)),
  );
  return base64url(iv) + '.' + base64url(new Uint8Array(encrypted));
}

/** The decrypted contents of the named cookie; null when it is missing or was not sealed here. */
export async function unseal(
  request: Request,
  name: string,
  secret: string,
  label: string,
  origin: string,
): Promise<unknown> {
  const cookie = request.headers
    .get('Cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(name + '='));
  const [iv, data, extra] = cookie?.slice(name.length + 1).split('.') ?? [];
  if (!iv || !data || extra !== undefined || data.length > 3000) return null;
  try {
    const decoded = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64url(iv), additionalData: bytes.encode(origin) },
      await key(secret, label),
      fromBase64url(data),
    );
    return JSON.parse(new TextDecoder().decode(decoded)) as unknown;
  } catch {
    return null;
  }
}
