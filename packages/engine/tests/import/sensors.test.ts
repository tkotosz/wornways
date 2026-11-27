import { describe, expect, it } from 'vitest';
import { parseFit } from '../../src/import/fit.ts';
import { parseGpx, parseTcx } from '../../src/import/xml.ts';

type Record = {
  hr?: number;
  cadence?: number;
  power?: number;
  temperature?: number;
  /** Meters per second, as enhanced_speed. */
  speed?: number;
};

/**
 * A small FIT activity: one record a second heading east, with the given readings (FIT's
 * "invalid" value where one is missing), and a session with the sport and the calories.
 */
function fitFile(records: Record[], calories?: number): Uint8Array {
  const bytes: number[] = [];
  const u8 = (v: number) => bytes.push(v & 0xff);
  const u16 = (v: number) => {
    u8(v);
    u8(v >> 8);
  };
  const u32 = (v: number) => {
    u16(v);
    u16(v >>> 16);
  };
  const define = (local: number, global: number, fields: [number, number, number][]) => {
    u8(0x40 | local);
    u8(0);
    u8(0); // little-endian
    u16(global);
    u8(fields.length);
    for (const [num, size, type] of fields) {
      u8(num);
      u8(size);
      u8(type);
    }
  };
  define(0, 20, [
    [253, 4, 0x86],
    [0, 4, 0x85],
    [1, 4, 0x85],
    [3, 1, 0x02],
    [4, 1, 0x02],
    [7, 2, 0x84],
    [13, 1, 0x01],
    [73, 4, 0x86],
  ]);
  const semicircles = (degrees: number) => Math.round((degrees * 2147483648) / 180);
  records.forEach((record, i) => {
    u8(0);
    u32(1_000_000_000 + i);
    u32(semicircles(47.5));
    u32(semicircles(19 + i * 0.0001));
    u8(record.hr ?? 0xff);
    u8(record.cadence ?? 0xff);
    u16(record.power ?? 0xffff);
    u8(record.temperature ?? 0x7f);
    u32(record.speed === undefined ? 0xffffffff : Math.round(record.speed * 1000));
  });
  define(1, 18, [
    [253, 4, 0x86],
    [5, 1, 0x00],
    [11, 2, 0x84],
  ]);
  u8(1);
  u32(1_000_000_000 + records.length);
  u8(2); // cycling
  u16(calories ?? 0xffff);

  const header = [14, 0x10, 0, 0, 0, 0, 0, 0, 0x2e, 0x46, 0x49, 0x54, 0, 0];
  const out = new Uint8Array(14 + bytes.length + 2);
  out.set(header);
  new DataView(out.buffer).setUint32(4, bytes.length, true);
  out.set(bytes, 14);
  return out;
}

const encoder = new TextEncoder();

describe('reading sensor values', () => {
  it('reads heart rate, cadence, power, temperature, speed and calories from FIT', () => {
    const activity = parseFit(
      fitFile(
        [
          { hr: 120, cadence: 85, power: 200, temperature: 21, speed: 8.25 },
          { hr: 122, power: 210, temperature: -3, speed: 8.5 },
          { hr: 125, cadence: 88, power: 0 },
        ],
        640,
      ),
    )!;
    const { sensors } = activity;
    expect(Array.from(sensors!.heartRate!)).toEqual([120, 122, 125]);
    expect(Array.from(sensors!.cadence!)).toEqual([85, NaN, 88]);
    expect(Array.from(sensors!.power!)).toEqual([200, 210, 0]);
    expect(Array.from(sensors!.temperature!)).toEqual([21, -3, NaN]);
    expect(Array.from(sensors!.speed!)).toEqual([8.25, 8.5, NaN]);
    expect(activity.calories).toBe(640);
  });

  it('leaves sensors and calories out of a FIT file without them', () => {
    const activity = parseFit(fitFile([{}, {}, {}]))!;
    expect(activity.sensors).toBeUndefined();
    expect(activity.calories).toBeUndefined();
  });

  it("reads Garmin's track point extension, speed included, and power from GPX", () => {
    const point = (i: number, extensions: string) =>
      `<trkpt lat="47.5" lon="${19 + i * 0.0001}"><ele>100</ele>` +
      `<time>2026-05-02T08:15:0${i}Z</time><extensions>${extensions}</extensions></trkpt>`;
    const gpx =
      '<gpx><trk><type>cycling</type><trkseg>' +
      point(
        0,
        '<power>180</power><gpxtpx:TrackPointExtension><gpxtpx:atemp>19</gpxtpx:atemp><gpxtpx:hr>131</gpxtpx:hr><gpxtpx:cad>90</gpxtpx:cad><gpxtpx:speed>8.5</gpxtpx:speed></gpxtpx:TrackPointExtension>',
      ) +
      point(1, '<ns3:TrackPointExtension><ns3:hr>133</ns3:hr></ns3:TrackPointExtension>') +
      '</trkseg></trk></gpx>';
    const { sensors, calories } = parseGpx(encoder.encode(gpx))!;
    expect(Array.from(sensors!.heartRate!)).toEqual([131, 133]);
    expect(Array.from(sensors!.cadence!)).toEqual([90, NaN]);
    expect(Array.from(sensors!.power!)).toEqual([180, NaN]);
    expect(Array.from(sensors!.temperature!)).toEqual([19, NaN]);
    expect(Array.from(sensors!.speed!)).toEqual([8.5, NaN]);
    expect(calories).toBeUndefined();
  });

  it('reads heart rate, cadence, power, speed and the laps’ calories from TCX', () => {
    const point = (i: number, inside: string) =>
      `<Trackpoint><Time>2026-04-27T15:20:0${i}Z</Time><Position><LatitudeDegrees>47.5</LatitudeDegrees>` +
      `<LongitudeDegrees>${19 + i * 0.0001}</LongitudeDegrees></Position>${inside}</Trackpoint>`;
    const tcx =
      '<TrainingCenterDatabase><Activities><Activity Sport="Running">' +
      '<Lap><Calories>210</Calories><Track>' +
      point(
        0,
        '<HeartRateBpm><Value>150</Value></HeartRateBpm><Extensions><ns3:TPX><ns3:RunCadence>86</ns3:RunCadence><ns3:Watts>250</ns3:Watts><ns3:Speed>3.5</ns3:Speed></ns3:TPX></Extensions>',
      ) +
      '</Track></Lap><Lap><Calories>190</Calories><Track>' +
      point(1, '<HeartRateBpm><Value>155</Value></HeartRateBpm><Cadence>88</Cadence>') +
      '</Track></Lap></Activity></Activities></TrainingCenterDatabase>';
    const { sensors, calories } = parseTcx(encoder.encode(tcx))!;
    expect(Array.from(sensors!.heartRate!)).toEqual([150, 155]);
    expect(Array.from(sensors!.cadence!)).toEqual([86, 88]);
    expect(Array.from(sensors!.power!)).toEqual([250, NaN]);
    expect(sensors!.temperature).toBeUndefined();
    expect(Array.from(sensors!.speed!)).toEqual([3.5, NaN]);
    expect(calories).toBe(400);
  });
});
