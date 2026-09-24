// Simulated SentinelBox backend. Emits readings in the README schema and applies the
// same scoring rules the ESP firmware uses, so the dashboard works before the API exists.
// Set NEXT_PUBLIC_SENTINEL_API_URL and this module is no longer called.

import { RULES, STATUS } from "./config";
import type { DeviceInfo, RawReading } from "./types";

const STEP_MS = 2000;
const CYCLE_S = 1100; // the perturbation script repeats so the live demo keeps moving
// Chosen so the page opens mid-way through HVAC-02's heat test (live alert on load).
const HISTORY_S = CYCLE_S + 395;

// Deviation (%) at which a sensor's anomaly score reaches 100.
const TOLERANCE = { temperature: 20, current: 15, pressure: 25 } as const;
type Key = keyof typeof TOLERANCE;

interface PerturbationEvent {
  s: number;
  e: number;
  sensor: Key;
  mag: number;
  rel?: boolean;
  tau: number;
  real: boolean;
}

type Channel = Key | "vibration";

interface SimUnit {
  unit_id: string;
  chip: string;
  learnS: number;
  base: Record<Channel, number>;
  noise: Record<Channel, number>;
  events: PerturbationEvent[];
  /** Windows (cycle seconds) where a sensor is disconnected and reports null. */
  dropouts: { sensor: Channel; s: number; e: number }[];
  ram: [number, number];
  flash: [number, number];
}

const UNITS: SimUnit[] = [
  {
    unit_id: "HVAC-01",
    chip: "ESP32-WROOM-32",
    learnS: 90,
    base: { temperature: 24.5, current: 0.32, pressure: 118, vibration: 1.1 },
    noise: { temperature: 0.12, current: 0.004, pressure: 1.4, vibration: 0.06 },
    dropouts: [{ sensor: "pressure", s: 820, e: 870 }],
    events: [
      // Hair dryer on the intake: controlled temperature perturbation.
      { s: 220, e: 300, sensor: "temperature", mag: 9, tau: 12, real: true },
      // Partial blockage: airflow / pressure drop.
      { s: 520, e: 575, sensor: "pressure", mag: -0.4, rel: true, tau: 3, real: true },
      // Motor inrush transient while the unit is actually healthy (false-alarm source).
      { s: 760, e: 772, sensor: "current", mag: 0.22, rel: true, tau: 2, real: false },
      { s: 900, e: 960, sensor: "temperature", mag: 10, tau: 10, real: true },
    ],
    ram: [41.6, 320],
    flash: [418, 4096],
  },
  {
    unit_id: "HVAC-02",
    chip: "ESP32-WROOM-32",
    learnS: 120,
    base: { temperature: 25.1, current: 0.55, pressure: 142, vibration: 1.25 },
    noise: { temperature: 0.12, current: 0.006, pressure: 1.8, vibration: 0.07 },
    // Vibration sensor loose on the fan housing: offline when the page opens.
    dropouts: [{ sensor: "vibration", s: 330, e: 560 }],
    events: [
      { s: 360, e: 440, sensor: "temperature", mag: 8, tau: 14, real: true },
      { s: 640, e: 700, sensor: "pressure", mag: -0.38, rel: true, tau: 3, real: true },
      // Subtle perturbation below the detection limits (missed-anomaly source).
      { s: 980, e: 1030, sensor: "temperature", mag: 2, tau: 10, real: true },
    ],
    ram: [41.2, 320],
    flash: [418, 4096],
  },
];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function eventEffect(ev: PerturbationEvent, c: number, base: number) {
  if (c < ev.s) return 0;
  const full = ev.rel ? ev.mag * base : ev.mag;
  const rise = (x: number) => full * (1 - Math.exp(-x / ev.tau));
  if (c <= ev.e) return rise(c - ev.s);
  return rise(ev.e - ev.s) * Math.exp(-(c - ev.e) / ev.tau);
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

interface SimState {
  unit: SimUnit;
  rand: () => number;
  samples: Record<Channel, number>[];
  baseline: Record<Key, number> | null;
  window: boolean[];
  readings: RawReading[];
  nextT: number;
}

let sessionStart = 0;
let state: SimState[] | null = null;

function init() {
  sessionStart = Date.now() - HISTORY_S * 1000;
  state = UNITS.map((u, i) => ({
    unit: u,
    rand: mulberry32(1234 + i * 77),
    samples: [],
    baseline: null,
    window: [],
    readings: [],
    nextT: sessionStart + i * 250,
  }));
}

function step(st: SimState, t: number): RawReading {
  const { unit, rand } = st;
  const elapsed = (t - sessionStart) / 1000;
  const c = elapsed % CYCLE_S;

  const values = {} as Record<Channel, number>;
  for (const key of Object.keys(unit.base) as Channel[]) {
    let v = unit.base[key] + gaussian(rand) * unit.noise[key];
    for (const ev of unit.events) if (ev.sensor === key) v += eventEffect(ev, c, unit.base[key]);
    values[key] = v;
  }
  const real = unit.events.some((ev) => ev.real && c >= ev.s && c <= ev.e) ? "PERTURBATION" : "NORMAL";

  const reading: RawReading = {
    timestamp: new Date(t).toISOString(),
    unit_id: unit.unit_id,
    temperature: round(values.temperature, 2),
    current: round(values.current, 4),
    pressure: round(values.pressure, 2),
    vibration: round(values.vibration, 3),
    baseline_temperature: null,
    baseline_current: null,
    baseline_pressure: null,
    temp_score: null,
    current_score: null,
    pressure_score: null,
    health_score: null,
    sentinel_status: STATUS.LEARNING,
    real_condition: real,
    processing_ms: round(2.6 + Math.abs(gaussian(rand)) * 0.45 + (rand() < 0.03 ? 1.4 : 0), 2),
  };

  for (const d of unit.dropouts) if (c >= d.s && c <= d.e) reading[d.sensor] = null;

  if (elapsed < unit.learnS) {
    st.samples.push(values);
    return reading;
  }

  if (!st.baseline) {
    const b = {} as Record<Key, number>;
    for (const key of Object.keys(TOLERANCE) as Key[]) {
      b[key] = st.samples.reduce((s, x) => s + x[key], 0) / st.samples.length;
    }
    st.baseline = b;
  }
  const baseline = st.baseline;

  // A disconnected sensor contributes no score.
  const score = (key: Key) => {
    if (reading[key] == null) return 0;
    const dev = (Math.abs(values[key] - baseline[key]) / baseline[key]) * 100;
    return round(Math.min(100, (dev / TOLERANCE[key]) * 100), 1);
  };
  const s = { temperature: score("temperature"), current: score("current"), pressure: score("pressure") };
  const anomaly =
    RULES.weights.current * s.current + RULES.weights.temperature * s.temperature + RULES.weights.pressure * s.pressure;
  const health = round(100 - anomaly, 1);

  const condition =
    health < RULES.healthThreshold || Math.max(s.temperature, s.current, s.pressure) > RULES.sensorScoreLimit;
  st.window.push(condition);
  if (st.window.length > RULES.persistence.window) st.window.shift();
  const hits = st.window.filter(Boolean).length;

  return {
    ...reading,
    baseline_temperature: round(baseline.temperature, 2),
    baseline_current: round(baseline.current, 4),
    baseline_pressure: round(baseline.pressure, 2),
    temp_score: s.temperature,
    current_score: s.current,
    pressure_score: s.pressure,
    health_score: health,
    sentinel_status: hits >= RULES.persistence.hits ? STATUS.MAINTENANCE : STATUS.NORMAL,
  };
}

function advance() {
  if (!state) init();
  const now = Date.now();
  for (const st of state!) {
    while (st.nextT <= now) {
      st.readings.push(step(st, st.nextT));
      st.nextT += STEP_MS;
    }
  }
}

export function getReadings(since?: number | null): RawReading[] {
  advance();
  const after = since ?? -Infinity;
  return state!.flatMap((st) => st.readings.filter((r) => new Date(r.timestamp).getTime() > after));
}

export function getUnits(): DeviceInfo[] {
  return UNITS.map((u) => ({
    unit_id: u.unit_id,
    chip: u.chip,
    ram_used_kb: u.ram[0],
    ram_total_kb: u.ram[1],
    flash_used_kb: u.flash[0],
    flash_total_kb: u.flash[1],
  }));
}
