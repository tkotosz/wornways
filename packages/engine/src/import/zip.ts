// Reading ZIP files (https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT) without
// reading them whole: first the table of contents at the end of the file, then each entry
// only when it is read. An account export's photos are listed but never read. Archives over
// 4 GB (ZIP64) work; entries are stored or deflated.

import { inflateRaw } from './unpack.ts';

/** A file whose parts can be read, such as a file the user picked or one on disk. */
export type RandomAccessFile = {
  name: string;
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
};

/** Where one file of a ZIP archive is, as its table of contents lists it. */
export type ZipEntry = {
  path: string;
  /** 0: stored as it is, 8: deflated. */
  method: number;
  compressedSize: number;
  size: number;
  /** Offset of the entry's local header in the archive. */
  localHeaderOffset: number;
  encrypted: boolean;
};

/** A ZIP file or one of its entries cannot be read. */
export class ZipError extends Error {}

const END_OF_DIRECTORY = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_END_OF_DIRECTORY = 0x06064b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const ZIP64_EXTRA_FIELD = 0x0001;
/** The end record is 22 bytes, followed by a comment of at most 65535 bytes. */
const END_RECORD_SIZE = 22;
const LONGEST_COMMENT = 0xffff;
const STORED = 0;
const DEFLATED = 8;

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const notAZip = () => new ZipError('not a ZIP file');

/** The files listed in the archive's table of contents, folders left out. */
export async function listZip(archive: RandomAccessFile): Promise<ZipEntry[]> {
  const tailLength = Math.min(archive.size, END_RECORD_SIZE + LONGEST_COMMENT);
  const tailStart = archive.size - tailLength;
  const tail = await archive.read(tailStart, tailLength);
  const tailView = view(tail);
  let end = -1;
  for (let i = tail.length - END_RECORD_SIZE; i >= 0; i--) {
    if (tailView.getUint32(i, true) === END_OF_DIRECTORY) {
      end = i;
      break;
    }
  }
  if (end < 0) throw notAZip();

  let count = tailView.getUint16(end + 10, true);
  let directorySize = tailView.getUint32(end + 12, true);
  let directoryOffset = tailView.getUint32(end + 16, true);
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    ({ count, directorySize, directoryOffset } = await zip64Directory(archive, tailStart + end));
  }
  if (directoryOffset + directorySize > archive.size) throw notAZip();
  const directory = await archive.read(directoryOffset, directorySize);
  return parseDirectory(directory, count).filter((entry) => !entry.path.endsWith('/'));
}

/** Where the table of contents is, from the ZIP64 end record found through its locator. */
async function zip64Directory(archive: RandomAccessFile, endOffset: number) {
  if (endOffset < 20) throw notAZip();
  const locator = view(await archive.read(endOffset - 20, 20));
  if (locator.getUint32(0, true) !== ZIP64_LOCATOR) throw notAZip();
  const recordOffset = Number(locator.getBigUint64(8, true));
  const record = view(await archive.read(recordOffset, 56));
  if (record.byteLength < 56 || record.getUint32(0, true) !== ZIP64_END_OF_DIRECTORY)
    throw notAZip();
  return {
    count: Number(record.getBigUint64(32, true)),
    directorySize: Number(record.getBigUint64(40, true)),
    directoryOffset: Number(record.getBigUint64(48, true)),
  };
}

function parseDirectory(directory: Uint8Array, count: number): ZipEntry[] {
  const v = view(directory);
  const text = new TextDecoder('utf-8');
  const entries: ZipEntry[] = [];
  let position = 0;
  for (let n = 0; n < count; n++) {
    if (position + 46 > directory.length || v.getUint32(position, true) !== DIRECTORY_ENTRY)
      throw notAZip();
    const flags = v.getUint16(position + 8, true);
    const method = v.getUint16(position + 10, true);
    let compressedSize = v.getUint32(position + 20, true);
    let size = v.getUint32(position + 24, true);
    const nameLength = v.getUint16(position + 28, true);
    const extraLength = v.getUint16(position + 30, true);
    const commentLength = v.getUint16(position + 32, true);
    let localHeaderOffset = v.getUint32(position + 42, true);
    const nameStart = position + 46;
    const path = text.decode(directory.subarray(nameStart, nameStart + nameLength));

    // ZIP64 keeps the values that do not fit in 32 bits in an extra field, in this order.
    let extra = nameStart + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = v.getUint16(extra, true);
      const length = v.getUint16(extra + 2, true);
      if (id === ZIP64_EXTRA_FIELD) {
        let field = extra + 4;
        const next = () => {
          const value = Number(v.getBigUint64(field, true));
          field += 8;
          return value;
        };
        if (size === 0xffffffff) size = next();
        if (compressedSize === 0xffffffff) compressedSize = next();
        if (localHeaderOffset === 0xffffffff) localHeaderOffset = next();
      }
      extra += 4 + length;
    }
    entries.push({
      path,
      method,
      compressedSize,
      size,
      localHeaderOffset,
      encrypted: (flags & 1) === 1,
    });
    position = extraEnd + commentLength;
  }
  return entries;
}

/** The unpacked content of one entry. */
export async function readZipEntry(
  archive: RandomAccessFile,
  entry: ZipEntry,
): Promise<Uint8Array> {
  if (entry.encrypted) throw new ZipError('encrypted in the ZIP file');
  const header = view(await archive.read(entry.localHeaderOffset, 30));
  if (header.byteLength < 30 || header.getUint32(0, true) !== LOCAL_HEADER)
    throw new ZipError('damaged in the ZIP file');
  const dataOffset =
    entry.localHeaderOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
  const data = await archive.read(dataOffset, entry.compressedSize);
  if (entry.method === STORED) return data;
  if (entry.method !== DEFLATED) throw new ZipError('compressed in a way that cannot be read');
  try {
    return await inflateRaw(data);
  } catch (error) {
    throw new ZipError('damaged in the ZIP file', { cause: error });
  }
}
