// Server-side simulator: writes simulated SentinelBox readings into the database, as if
// the two ESP units were posting. State lives on globalThis so it survives dev reloads.
// Stop it once real devices are posting, or both will write under the same unit ids.

import { Simulator, simulatedUnits } from "./mock";
import { addReadings, clearStore, upsertUnit } from "./store";

const TICK_MS = 2000;

interface SimServerState {
  sim: Simulator | null;
  timer: ReturnType<typeof setInterval> | null;
  written: number;
}

const g = globalThis as unknown as { __sentinelSim?: SimServerState };
const state: SimServerState = (g.__sentinelSim ??= { sim: null, timer: null, written: 0 });

function registerUnits() {
  for (const u of simulatedUnits()) upsertUnit(u);
}

/** Backfills `minutes` of history ending now. `reset` clears the database first. */
export function seed(minutes: number, reset: boolean) {
  if (reset) clearStore();
  state.sim = new Simulator(Date.now() - minutes * 60_000);
  const readings = state.sim.advanceTo(Date.now());
  addReadings(readings);
  registerUnits();
  state.written += readings.length;
  return readings.length;
}

/** Streams a reading per unit every 2 s, continuing from the last seed if there was one. */
export function start() {
  if (state.timer) return false;
  state.sim ??= new Simulator(Date.now());
  registerUnits();
  state.timer = setInterval(() => {
    const readings = state.sim!.advanceTo(Date.now());
    addReadings(readings);
    state.written += readings.length;
  }, TICK_MS);
  return true;
}

export function stop() {
  if (!state.timer) return false;
  clearInterval(state.timer);
  state.timer = null;
  return true;
}

export function status() {
  return {
    running: state.timer != null,
    session_start: state.sim ? new Date(state.sim.sessionStart).toISOString() : null,
    written: state.written,
  };
}
