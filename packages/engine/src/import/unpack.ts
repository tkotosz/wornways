// Unpacking compressed data with the DecompressionStream that browsers and Node share.

/** Whether the data starts like gzip. */
export const isGzip = (data: Uint8Array) => data[0] === 0x1f && data[1] === 0x8b;

async function unpack(data: Uint8Array, format: 'gzip' | 'deflate-raw'): Promise<Uint8Array> {
  const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Unpacks gzip data; rejects when the data is not gzip or is cut off. */
export const gunzip = (data: Uint8Array) => unpack(data, 'gzip');

/** Unpacks raw deflate data, as stored in a ZIP file; rejects when it is damaged. */
export const inflateRaw = (data: Uint8Array) => unpack(data, 'deflate-raw');
