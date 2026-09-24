// Server-side store for readings pushed by the SentinelBox devices.
//
// In-memory, kept on globalThis so it survives dev hot reloads. It is lost when the
// server restarts (and is per-instance on serverless hosts) — swap these functions for
// a database when the prototype needs persistence.

import { STATUS } from "./config";
import type { DeviceInfo, RawReading } from "./types";

const MAX_READINGS = 50_000;

interface Store {
  readings: RawReading[];
  units: Map<string, DeviceInfo & { last_seen: string }>;
}

const g = globalThis as unknown as { __sentinelStore?: Store };
const store: Store = (g.__sentinelStore ??= { readings: [], units: new Map() });

const NUMERIC_FIELDS = [
  "temperature",
  "current",
  "pressure",
  "vibration",
  "baseline_temperature",
  "baseline_current",
  "baseline_pressure",
  "baseline_vibration",
  "temp_score",
  "current_score",
  "pressure_score",
  "health_score",
  "processing_ms",
] as const;

const STATUSES: string[] = Object.values(STATUS);

export type ValidationResult = { ok: true; reading: RawReading } | { ok: false; error: string };

/**
 * Validates one incoming reading. Only `unit_id` is required; numbers may be null
 * (a disconnected sensor), `timestamp` defaults to now (ISO string or epoch ms).
 */
export function validateReading(input: unknown, index = 0): ValidationResult {
  const at = `readings[${index}]`;
  if (!input || typeof input !== "object") return { ok: false, error: `${at}: must be an object` };
  const r = input as Record<string, unknown>;

  if (typeof r.unit_id !== "string" || !r.unit_id.trim() || r.unit_id.length > 64) {
    return { ok: false, error: `${at}.unit_id: required string (max 64 chars)` };
  }

  let t = Date.now();
  if (r.timestamp != null) {
    t = typeof r.timestamp === "number" ? r.timestamp : Date.parse(String(r.timestamp));
    if (!Number.isFinite(t)) return { ok: false, error: `${at}.timestamp: must be ISO 8601 or epoch ms` };
  }

  const nums: Partial<Record<(typeof NUMERIC_FIELDS)[number], number | null>> = {};
  for (const f of NUMERIC_FIELDS) {
    const v = r[f];
    if (v == null) nums[f] = null;
    else if (typeof v === "number" && Number.isFinite(v)) nums[f] = v;
    else return { ok: false, error: `${at}.${f}: must be a number or null` };
  }

  const health = nums.health_score ?? null;
  let status = r.sentinel_status == null ? (health == null ? STATUS.LEARNING : STATUS.NORMAL) : String(r.sentinel_status);
  status = status.toUpperCase();
  if (!STATUSES.includes(status)) {
    return { ok: false, error: `${at}.sentinel_status: one of ${STATUSES.join(", ")}` };
  }

  return {
    ok: true,
    reading: {
      timestamp: new Date(t).toISOString(),
      unit_id: r.unit_id.trim(),
      temperature: nums.temperature ?? null,
      current: nums.current ?? null,
      pressure: nums.pressure ?? null,
      vibration: nums.vibration ?? null,
      baseline_temperature: nums.baseline_temperature ?? null,
      baseline_current: nums.baseline_current ?? null,
      baseline_pressure: nums.baseline_pressure ?? null,
      baseline_vibration: nums.baseline_vibration ?? null,
      temp_score: nums.temp_score ?? null,
      current_score: nums.current_score ?? null,
      pressure_score: nums.pressure_score ?? null,
      health_score: health,
      sentinel_status: status,
      real_condition: r.real_condition == null ? null : String(r.real_condition),
      processing_ms: nums.processing_ms ?? null,
    },
  };
}

export function addReadings(readings: RawReading[]) {
  store.readings.push(...readings);
  store.readings.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  if (store.readings.length > MAX_READINGS) store.readings.splice(0, store.readings.length - MAX_READINGS);
  for (const r of readings) {
    const prev = store.units.get(r.unit_id);
    if (!prev || prev.last_seen < r.timestamp) store.units.set(r.unit_id, { ...prev, unit_id: r.unit_id, last_seen: r.timestamp });
  }
}

export function queryReadings({ since, unitId, limit }: { since?: number; unitId?: string; limit?: number }) {
  let out = store.readings;
  if (since != null) out = out.filter((r) => Date.parse(r.timestamp) > since);
  if (unitId) out = out.filter((r) => r.unit_id === unitId);
  return limit ? out.slice(-limit) : out;
}

export function upsertUnit(info: DeviceInfo) {
  const prev = store.units.get(info.unit_id);
  store.units.set(info.unit_id, { ...prev, ...info, last_seen: prev?.last_seen ?? new Date().toISOString() });
}

export function listUnits() {
  return [...store.units.values()];
}

export function clearStore() {
  store.readings = [];
  store.units.clear();
}
