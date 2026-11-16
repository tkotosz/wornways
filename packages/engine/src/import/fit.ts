import type { ParsedActivity } from '../track/types.ts';

// A minimal FIT reader for what activity files need: definition and data messages,
// compressed timestamp headers, developer fields (skipped) and chained files.
// Based on third-party MIT-licensed code (see THIRD_PARTY_NOTICES.md), with altitude added.

const FIT_EPOCH_S = 631065600; // 1989-12-31T00:00:00Z
const MSG_SPORT = 12;
const MSG_SESSION = 18;
const MSG_RECORD = 20;
const INVALID_SINT32 = 0x7fffffff;

// The FIT standard's sports (Garmin FIT SDK 21.221.0, profile type "sport"), named like
// Strava's activity types where both have the sport, so that one sport has one name
// whichever file it comes from.
const SPORTS: Record<number, string> = {
  0: 'workout',
  1: 'run',
  2: 'ride',
  3: 'transition',
  4: 'workout',
  5: 'swim',
  6: 'basketball',
  7: 'soccer',
  8: 'tennis',
  9: 'american-football',
  10: 'workout',
  11: 'walk',
  12: 'nordic-ski',
  13: 'alpine-ski',
  14: 'snowboard',
  15: 'rowing',
  16: 'mountaineering',
  17: 'hike',
  18: 'multisport',
  19: 'paddling',
  20: 'flying',
  21: 'e-bike-ride',
  22: 'motorcycling',
  23: 'boating',
  24: 'driving',
  25: 'golf',
  26: 'hang-gliding',
  27: 'horseback-riding',
  28: 'hunting',
  29: 'fishing',
  30: 'inline-skate',
  31: 'rock-climbing',
  32: 'sail',
  33: 'ice-skate',
  34: 'sky-diving',
  35: 'snowshoe',
  36: 'snowmobiling',
  37: 'stand-up-paddling',
  38: 'surfing',
  39: 'wakeboarding',
  40: 'water-skiing',
  41: 'kayaking',
  42: 'rafting',
  43: 'windsurf',
  44: 'kitesurf',
  45: 'tactical',
  46: 'jumpmaster',
  47: 'boxing',
  48: 'floor-climbing',
  49: 'baseball',
  53: 'diving',
  56: 'shooting',
  58: 'winter-sport',
  59: 'grinding',
  62: 'hiit',
  63: 'video-gaming',
  64: 'racket',
  65: 'wheelchair-push-walk',
  66: 'wheelchair-push-run',
  67: 'meditation',
  68: 'para-sport',
  69: 'disc-golf',
  70: 'team-sport',
  71: 'cricket',
  72: 'rugby',
  73: 'hockey',
  74: 'lacrosse',
  75: 'volleyball',
  76: 'water-tubing',
  77: 'wakesurfing',
  78: 'water-sport',
  79: 'archery',
  80: 'mixed-martial-arts',
  81: 'motor-sports',
  82: 'snorkeling',
  83: 'dance',
  84: 'jump-rope',
  85: 'pool-apnea',
  86: 'mobility',
  87: 'geocaching',
  88: 'canoeing',
};
const SUB_SPORT_INDOOR_CYCLING = 6;
const SUB_SPORT_VIRTUAL = 58;

type Definition = {
  little: boolean;
  globalNum: number;
  /** Flat [fieldNum, size, fieldNum, size, ...]. */
  fields: number[];
  devBytes: number;
};

function sportSlug(sport: number, subSport: number): string {
  if (sport < 0) return 'unknown';
  const base = SPORTS[sport] ?? `fit-sport-${sport}`;
  const indoor =
    subSport === SUB_SPORT_VIRTUAL || (sport === 2 && subSport === SUB_SPORT_INDOOR_CYCLING);
  return indoor ? `virtual-${base}` : base;
}

/** Returns null when the file holds fewer than two positioned records. Throws if it is not FIT at all. */
export function parseFit(data: Uint8Array): ParsedActivity | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out: number[] = []; // lon, lat, ele, absolute FIT seconds
  let sport = -1;
  let subSport = -1;
  let start = 0;
  if (data.length < 12 || view.getUint32(8, false) !== 0x2e464954)
    throw new Error('not a FIT file');

  try {
    // ".FIT" at bytes 8..11 of each header; several files may be chained back to back.
    while (start + 12 <= data.length && view.getUint32(start + 8, false) === 0x2e464954) {
      const headerSize = data[start];
      const end = start + headerSize + view.getUint32(start + 4, true);
      const defs: (Definition | undefined)[] = new Array(16);
      let pos = start + headerSize;
      let lastTs = -1;

      while (pos < end) {
        const header = data[pos++];
        let ts = -1;
        let local: number;

        if (header & 0x80) {
          // Compressed timestamp: a 5-bit offset that rolls over from the last full timestamp.
          local = (header >> 5) & 0x3;
          const offset = header & 0x1f;
          if (lastTs >= 0) {
            const low = lastTs % 32;
            ts = lastTs - low + offset + (offset < low ? 32 : 0);
            lastTs = ts;
          }
        } else if (header & 0x40) {
          const little = data[pos + 1] === 0;
          const globalNum = view.getUint16(pos + 2, little);
          const count = data[pos + 4];
          pos += 5;
          const fields: number[] = [];
          for (let i = 0; i < count; i++) fields.push(data[pos + 3 * i], data[pos + 3 * i + 1]);
          pos += 3 * count;
          let devBytes = 0;
          if (header & 0x20) {
            const devCount = data[pos];
            for (let i = 0; i < devCount; i++) devBytes += data[pos + 2 + 3 * i];
            pos += 1 + 3 * devCount;
          }
          defs[header & 0x0f] = { little, globalNum, fields, devBytes };
          continue;
        } else {
          local = header & 0x0f;
        }

        const def = defs[local];
        if (!def) throw new RangeError('FIT data message without a definition');
        const { little, globalNum, fields } = def;
        let lat = INVALID_SINT32;
        let lon = INVALID_SINT32;
        let ele = NaN;
        let fieldSport = 0xff;
        let fieldSubSport = 0xff;

        for (let i = 0; i < fields.length; i += 2) {
          const num = fields[i];
          const size = fields[i + 1];
          if (num === 253 && size === 4) {
            const v = view.getUint32(pos, little);
            if (v !== 0xffffffff) ts = lastTs = v;
          } else if (globalNum === MSG_RECORD) {
            if (num === 0 && size === 4) lat = view.getInt32(pos, little);
            else if (num === 1 && size === 4) lon = view.getInt32(pos, little);
            else if (num === 2 && size === 2) {
              // altitude: uint16, scale 5, offset 500. enhanced_altitude (78) wins if present.
              const v = view.getUint16(pos, little);
              if (v !== 0xffff && Number.isNaN(ele)) ele = v / 5 - 500;
            } else if (num === 78 && size === 4) {
              const v = view.getUint32(pos, little);
              if (v !== 0xffffffff) ele = v / 5 - 500;
            }
          } else if (globalNum === MSG_SESSION && size === 1) {
            if (num === 5) fieldSport = data[pos];
            else if (num === 6) fieldSubSport = data[pos];
          } else if (globalNum === MSG_SPORT && size === 1) {
            if (num === 0) fieldSport = data[pos];
            else if (num === 1) fieldSubSport = data[pos];
          }
          pos += size;
        }
        pos += def.devBytes;
        if (pos > end) throw new RangeError('FIT message runs past the end of the file');

        if (globalNum === MSG_RECORD) {
          const positioned =
            lat !== INVALID_SINT32 && lon !== INVALID_SINT32 && !(lat === 0 && lon === 0);
          if (ts >= 0 && positioned) {
            // Positions are stored in semicircles: degrees = semicircles * 180 / 2^31.
            out.push((lon * 180) / 2147483648, (lat * 180) / 2147483648, ele, ts);
          }
        } else if (sport < 0 && fieldSport !== 0xff) {
          sport = fieldSport;
          subSport = fieldSubSport;
        }
      }
      start = end + 2; // skip the CRC
    }
  } catch (err) {
    // A truncated file still has usable points before the cut.
    if (!(err instanceof RangeError)) throw err;
  }

  const n = out.length / 4;
  if (n < 2) return null;

  // Records are normally in time order; sort only when a device wrote them otherwise.
  let order: number[] | null = null;
  for (let i = 1; i < n; i++) {
    if (out[i * 4 + 3] < out[(i - 1) * 4 + 3]) {
      order = Array.from({ length: n }, (_, k) => k).sort(
        (a, b) => out[a * 4 + 3] - out[b * 4 + 3],
      );
      break;
    }
  }

  const points = new Float64Array(n * 4);
  const t0 = out[(order ? order[0] : 0) * 4 + 3];
  for (let i = 0; i < n; i++) {
    const src = (order ? order[i] : i) * 4;
    points[i * 4] = out[src];
    points[i * 4 + 1] = out[src + 1];
    points[i * 4 + 2] = out[src + 2];
    points[i * 4 + 3] = out[src + 3] - t0;
  }
  return { sport: sportSlug(sport, subSport), startTime: (t0 + FIT_EPOCH_S) * 1000, points };
}
