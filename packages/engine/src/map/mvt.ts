// A minimal Mapbox Vector Tile decoder: enough protobuf to read layers, feature
// properties and geometry. https://github.com/mapbox/vector-tile-spec

export const MVT_POINT = 1;
export const MVT_LINE = 2;
export const MVT_POLYGON = 3;

export type MvtValue = string | number | boolean;

export type MvtFeature = {
  type: number;
  props: Record<string, MvtValue>;
  /** One flat [x, y, x, y, ...] array per point group, line or polygon ring, in tile units. */
  geometry: number[][];
};

export type MvtLayer = { extent: number; features: MvtFeature[] };

/** Decodes only the layers named in `wanted`; the rest are skipped without being parsed. */
export function decodeMvt(data: Uint8Array, wanted: ReadonlySet<string>): Map<string, MvtLayer> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const text = new TextDecoder('utf-8');
  let pos = 0;

  function varint(): number {
    let result = 0;
    let mul = 1;
    for (;;) {
      if (pos >= data.length) throw new RangeError('MVT: unexpected end of tile');
      const b = data[pos++];
      result += (b & 0x7f) * mul;
      if (b < 0x80) return result;
      mul *= 128;
    }
  }
  function skip(wire: number): void {
    if (wire === 0) varint();
    else if (wire === 1) pos += 8;
    else if (wire === 2) pos += varint();
    else if (wire === 5) pos += 4;
    else throw new RangeError(`MVT: unsupported wire type ${wire}`);
  }
  function string(): string {
    const len = varint();
    const s = text.decode(data.subarray(pos, pos + len));
    pos += len;
    return s;
  }
  const zigzag = (n: number) => (n % 2 ? -(n + 1) / 2 : n / 2);

  function readValue(end: number): MvtValue {
    let value: MvtValue = '';
    while (pos < end) {
      const tag = varint();
      switch (tag >>> 3) {
        case 1:
          value = string();
          break;
        case 2:
          value = view.getFloat32(pos, true);
          pos += 4;
          break;
        case 3:
          value = view.getFloat64(pos, true);
          pos += 8;
          break;
        case 4:
        case 5:
          value = varint();
          break;
        case 6:
          value = zigzag(varint());
          break;
        case 7:
          value = varint() !== 0;
          break;
        default:
          skip(tag & 7);
      }
    }
    return value;
  }

  function readFeature(end: number, keys: string[], values: MvtValue[]): MvtFeature {
    const feature: MvtFeature = { type: 0, props: {}, geometry: [] };
    while (pos < end) {
      const tag = varint();
      const field = tag >>> 3;
      if (field === 2) {
        const tagsEnd = varint() + pos;
        while (pos < tagsEnd) {
          const key = keys[varint()];
          feature.props[key] = values[varint()];
        }
      } else if (field === 3) {
        feature.type = varint();
      } else if (field === 4) {
        const geomEnd = varint() + pos;
        let x = 0;
        let y = 0;
        let current: number[] | null = null;
        while (pos < geomEnd) {
          const command = varint();
          const id = command & 7;
          if (id === 7) {
            if (current) current.push(current[0], current[1]); // ClosePath
            continue;
          }
          for (let count = command >>> 3; count > 0; count--) {
            x += zigzag(varint());
            y += zigzag(varint());
            if (id === 1)
              feature.geometry.push((current = [x, y])); // MoveTo
            else current?.push(x, y); // LineTo
          }
        }
      } else skip(tag & 7);
    }
    return feature;
  }

  function readLayer(end: number): void {
    let name = '';
    let extent = 4096;
    const keys: string[] = [];
    const values: MvtValue[] = [];
    const featureRanges: number[] = [];
    while (pos < end) {
      const tag = varint();
      switch (tag >>> 3) {
        case 1:
          name = string();
          break;
        case 2: {
          const len = varint();
          featureRanges.push(pos, pos + len);
          pos += len;
          break;
        }
        case 3:
          keys.push(string());
          break;
        case 4: {
          const len = varint();
          values.push(readValue(pos + len));
          break;
        }
        case 5:
          extent = varint();
          break;
        default:
          skip(tag & 7);
      }
    }
    if (!wanted.has(name)) return;
    // Keys and values may follow the features in the byte stream, so features are read last.
    const features: MvtFeature[] = [];
    for (let i = 0; i < featureRanges.length; i += 2) {
      pos = featureRanges[i];
      features.push(readFeature(featureRanges[i + 1], keys, values));
    }
    layers.set(name, { extent, features });
  }

  const layers = new Map<string, MvtLayer>();
  while (pos < data.length) {
    const tag = varint();
    if (tag >>> 3 === 3 && (tag & 7) === 2) {
      const end = varint() + pos;
      readLayer(end);
      pos = end;
    } else skip(tag & 7);
  }
  return layers;
}
