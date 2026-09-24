// Simulated SentinelBox devices. Emits readings in the README schema and applies the
// same scoring rules the ESP firmware uses. Runs in the browser when no API is
// configured, and on the server to seed / stream simulated data into the database.

import { RULES } from "./config";
import type { DeviceInfo, RawReading } from "./types";

const STEP_MS = 2000;
const CYCLE_S = 1100; // the perturbation script repeats so the live demo keeps moving
// Chosen so the page opens mid-way through HVAC-02's heat test (live alert on load).
const HISTORY_S = CYCLE_S + 395;

// Deviation (%) at which a sensor's anomaly score reaches 100.
const TOLERANCE = { temperature: 20, current: 15, vibration: 30 } as const;
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

type Channel = Key;

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
    base: { temperature: 24.5, current: 0.32, vibration: 1.1 },
    noise: { temperature: 0.12, current: 0.004, vibration: 0.06 },
    dropouts: [],
    events: [
      // Hair dryer on the intake: controlled temperature perturbation.
      { s: 220, e: 300, sensor: "temperature", mag: 9, tau: 12, real: true },
      // Unbalanced fan blade: vibration spike.
      { s: 520, e: 575, sensor: "vibration", mag: 0.6, rel: true, tau: 3, real: true },
      // Motor inrush transient while the unit is actually healthy (false-alarm source).
      { s: 760, e: 772, sensor: "current", mag: 0.22, rel: true, tau: 2, real: false },
      { s: 900, e: 960, sensor: "temperature", mag: 10, tau: 10, real: true },
      // Loose fan mount: vibration creeps up (elevated, below the maintenance limit).
      { s: 330, e: 470, sensor: "vibration", mag: 0.2, rel: true, tau: 20, real: true },
    ],
    ram: [41.6, 320],
    flash: [418, 4096],
  },
  {
    unit_id: "HVAC-02",
    chip: "ESP32-WROOM-32",
    learnS: 120,
    base: { temperature: 25.1, current: 0.55, vibration: 1.25 },
    noise: { temperature: 0.12, current: 0.006, vibration: 0.07 },
    // Vibration sensor loose on the fan housing: offline when the page opens.
    dropouts: [{ sensor: "vibration", s: 330, e: 560 }],
    events: [
      { s: 360, e: 440, sensor: "temperature", mag: 8, tau: 14, real: true },
      { s: 640, e: 700, sensor: "vibration", mag: 0.55, rel: true, tau: 3, real: true },
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
  baseline: Record<Channel, number> | null;
  /** Severity of the last readings: 0 normal, 1 warning, 2 maintenance. */
  window: number[];
  nextT: number;
}

/**
 * Deterministic simulation of both SentinelBox units. `advanceTo(t)` returns every
 * reading produced since the last call, one per unit every 2 s. Used in the browser
 * (mock mode) and on the server (to seed and stream into the database).
 */
export class Simulator {
  readonly sessionStart: number;
  private state: SimState[];

  constructor(sessionStart = Date.now() - HISTORY_S * 1000) {
    this.sessionStart = sessionStart;
    this.state = UNITS.map((u, i) => ({
      unit: u,
      rand: mulberry32(1234 + i * 77),
      samples: [],
      baseline: null,
      window: [],
      nextT: sessionStart + i * 250,
    }));
  }

  advanceTo(t = Date.now()): RawReading[] {
    const out: RawReading[] = [];
    for (const st of this.state) {
      while (st.nextT <= t) {
        out.push(this.step(st, st.nextT));
        st.nextT += STEP_MS;
      }
    }
    return out.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  private step(st: SimState, t: number): RawReading {
    const { unit, rand } = st;
    const elapsed = (t - this.sessionStart) / 1000;
    const c = elapsed % CYCLE_S;

    const values = {} as Record<Channel, number>;
    for (const key of Object.keys(unit.base) as Channel[]) {
      let v = unit.base[key] + gaussian(rand) * unit.noise[key];
      for (const ev of unit.events) if (ev.sensor === key) v += eventEffect(ev, c, unit.base[key]);
      values[key] = v;
    }

    const reading: RawReading = {
      timestamp: new Date(t).toISOString(),
      unit_id: unit.unit_id,
      temperature: round(values.temperature, 2),
      current: round(values.current, 4),
      vibration: round(values.vibration, 3),
      status: null,
      health_pct: null,
      temp_score: null,
      current_score: null,
      vibration_score: null,
      baseline_temperature: null,
      baseline_current: null,
      baseline_vibration: null,
    };

    for (const d of unit.dropouts) if (c >= d.s && c <= d.e) reading[d.sensor] = null;

    if (elapsed < unit.learnS) {
      st.samples.push(values);
      return reading;
    }

    if (!st.baseline) {
      const b = {} as Record<Channel, number>;
      for (const key of Object.keys(unit.base) as Channel[]) {
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
    const s = { temperature: score("temperature"), current: score("current"), vibration: score("vibration") };
    const anomaly =
      RULES.weights.current * s.current + RULES.weights.temperature * s.temperature + RULES.weights.vibration * s.vibration;
    const health = round(100 - anomaly, 1);

    const worst = Math.max(s.temperature, s.current, s.vibration);
    const level =
      health < RULES.healthThreshold || worst > RULES.sensorScoreLimit ? 2 : health < RULES.warningThreshold || worst > 40 ? 1 : 0;
    st.window.push(level);
    if (st.window.length > RULES.persistence.window) st.window.shift();
    const hits = (min: number) => st.window.filter((l) => l >= min).length;
    const status = hits(2) >= RULES.persistence.hits ? "degraded" : hits(1) >= RULES.persistence.hits ? "warning" : "healthy";

    return {
      ...reading,
      baseline_temperature: round(baseline.temperature, 2),
      baseline_current: round(baseline.current, 4),
      baseline_vibration: round(baseline.vibration, 3),
      health_pct: health,
      temp_score: s.temperature,
      current_score: s.current,
      vibration_score: s.vibration,
      status,
    };
  }
}

export function simulatedUnits(): DeviceInfo[] {
  return UNITS.map((u) => ({
    unit_id: u.unit_id,
    chip: u.chip,
    ram_used_kb: u.ram[0],
    ram_total_kb: u.ram[1],
    flash_used_kb: u.flash[0],
    flash_total_kb: u.flash[1],
  }));
}

// Browser mock mode: one simulator per page, readings kept in memory.
let browserSim: Simulator | null = null;
let browserReadings: RawReading[] = [];

export function getReadings(since?: number | null): RawReading[] {
  browserSim ??= new Simulator();
  browserReadings = browserReadings.concat(browserSim.advanceTo());
  const after = since ?? -Infinity;
  return browserReadings.filter((r) => new Date(r.timestamp).getTime() > after);
}

export const getUnits = simulatedUnits;
