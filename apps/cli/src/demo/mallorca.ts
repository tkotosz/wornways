// The demo set: made-up rides and runs on real roads in Mallorca. A month from Port de
// Pollença (for a recap), a five-day tour of the island (for a multiday trip) and the climb
// from Sa Calobra (for a highlight). Places are approximate: each snaps to the nearest road.

import type { LatLon } from './road-graph.ts';

const place = (lat: number, lon: number): LatLon => ({ lat, lon });

export const PLACES = {
  portDePollenca: place(39.9066, 3.083),
  pollenca: place(39.877, 3.016),
  caboFormentor: place(39.9617, 3.2115),
  calaSantVicenc: place(39.92, 3.054),
  alcudia: place(39.853, 3.121),
  canPicafort: place(39.765, 3.155),
  saPobla: place(39.769, 3.023),
  muro: place(39.736, 3.056),
  campanet: place(39.775, 2.966),
  selva: place(39.755, 2.9),
  inca: place(39.721, 2.911),
  lluc: place(39.823, 2.885),
  saCalobra: place(39.851, 2.8),
  sineu: place(39.643, 3.011),
  petra: place(39.613, 3.113),
  arta: place(39.693, 3.35),
  algaida: place(39.559, 2.894),
  palma: place(39.57, 2.65),
  andratx: place(39.575, 2.42),
  portDAndratx: place(39.543, 2.389),
  estellencs: place(39.653, 2.481),
  banyalbufar: place(39.687, 2.512),
  valldemossa: place(39.711, 2.622),
  deia: place(39.748, 2.649),
  soller: place(39.766, 2.715),
};

export type DemoActivity = {
  name: string;
  sport: 'ride' | 'run';
  /** Start time in UTC; Mallorca is two hours ahead in April and May. */
  start: string;
  /** The places the route passes, in order, start and finish included. */
  via: LatLon[];
};

const P = PLACES;
const home = P.portDePollenca;

/** Rides of the month from Port de Pollença, April 2026. */
const MONTH_RIDES: DemoActivity[] = [
  ['Formentor lighthouse', '2026-04-02T07:40:00Z', [home, P.caboFormentor, home]],
  ['Alcúdia and Sa Pobla', '2026-04-04T08:10:00Z', [home, P.alcudia, P.saPobla, P.pollenca, home]],
  ['Up to Lluc', '2026-04-06T07:55:00Z', [home, P.pollenca, P.lluc, P.pollenca, home]],
  ['Cala Sant Vicenç', '2026-04-08T15:30:00Z', [home, P.calaSantVicenc, P.pollenca, home]],
  [
    'The flat loop',
    '2026-04-10T08:20:00Z',
    [home, P.saPobla, P.muro, P.canPicafort, P.alcudia, home],
  ],
  [
    'Lluc, Selva and Campanet',
    '2026-04-12T07:30:00Z',
    [home, P.pollenca, P.lluc, P.selva, P.campanet, P.pollenca, home],
  ],
  ['Formentor at sunrise', '2026-04-14T05:10:00Z', [home, P.caboFormentor, home]],
  [
    'Inca loop',
    '2026-04-16T08:00:00Z',
    [home, P.saPobla, P.inca, P.selva, P.campanet, P.pollenca, home],
  ],
  [
    'Sa Calobra',
    '2026-04-18T07:15:00Z',
    [home, P.pollenca, P.lluc, P.saCalobra, P.lluc, P.pollenca, home],
  ],
  [
    'Sineu and Petra',
    '2026-04-20T07:45:00Z',
    [home, P.saPobla, P.sineu, P.petra, P.muro, P.alcudia, home],
  ],
  ['Recovery spin', '2026-04-22T09:30:00Z', [home, P.alcudia, home]],
  [
    'Out to Artà',
    '2026-04-24T07:20:00Z',
    [home, P.alcudia, P.canPicafort, P.arta, P.canPicafort, P.alcudia, home],
  ],
  ['Coll de Femenia', '2026-04-26T08:05:00Z', [home, P.pollenca, P.lluc, P.pollenca, home]],
  ['Last Formentor', '2026-04-28T07:50:00Z', [home, P.caboFormentor, home]],
].map(([name, start, via]) => ({ name, sport: 'ride', start, via }) as DemoActivity);

/** Run days of the month; their loops are drawn at random around home. */
export const MONTH_RUNS: { name: string; start: string; km: number }[] = [
  { name: 'Morning run by the bay', start: '2026-04-03T06:30:00Z', km: 7 },
  { name: 'Easy run', start: '2026-04-07T16:40:00Z', km: 5 },
  { name: 'Pine wood run', start: '2026-04-11T06:45:00Z', km: 10 },
  { name: 'Harbour intervals', start: '2026-04-15T17:00:00Z', km: 6 },
  { name: 'Long run', start: '2026-04-21T06:20:00Z', km: 12 },
  { name: 'Shakeout run', start: '2026-04-27T16:30:00Z', km: 5 },
];

/** A tour of the island, one ride a day, May 2026. */
const TRIP: DemoActivity[] = [
  [
    'Tour day 1: Palma to Port d’Andratx',
    '2026-05-04T08:30:00Z',
    [P.palma, P.andratx, P.portDAndratx],
  ],
  [
    'Tour day 2: the coast road to Sóller',
    '2026-05-05T07:45:00Z',
    [P.portDAndratx, P.andratx, P.estellencs, P.banyalbufar, P.valldemossa, P.deia, P.soller],
  ],
  ['Tour day 3: Sóller to Pollença', '2026-05-06T08:00:00Z', [P.soller, P.lluc, P.pollenca]],
  [
    'Tour day 4: Pollença to Artà',
    '2026-05-07T08:15:00Z',
    [P.pollenca, P.alcudia, P.canPicafort, P.arta],
  ],
  [
    'Tour day 5: Artà to Palma',
    '2026-05-08T07:30:00Z',
    [P.arta, P.petra, P.sineu, P.algaida, P.palma],
  ],
].map(([name, start, via]) => ({ name, sport: 'ride', start, via }) as DemoActivity);

export const RIDES = [...MONTH_RIDES, ...TRIP];
export const HOME = home;

/** Cost per meter of each road class, relative to its length; Infinity rules a class out. */
export const RIDE_COST: Record<string, number> = {
  secondary: 1,
  tertiary: 1,
  minor: 1.15,
  primary: 1.6,
  service: 3,
};
export const RUN_COST: Record<string, number> = {
  path: 1,
  track: 1,
  minor: 1,
  service: 1.3,
  tertiary: 1.5,
  secondary: 2.5,
  primary: 5,
};
