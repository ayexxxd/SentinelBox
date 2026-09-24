// Server-side store for SentinelBox readings and device info, backed by SQLite
// (see db.ts). Route handlers call these functions; nothing else touches SQL.

import { STATUS } from "./config";
import { db, transaction } from "./db";
import type { DeviceInfo, HealthStatus, RawReading } from "./types";

const NUMERIC_FIELDS = [
  "temperature",
  "current",
  "vibration",
  "baseline_temperature",
  "baseline_current",
  "baseline_vibration",
  "temp_score",
  "current_score",
  "vibration_score",
  "health_pct",
  "processing_ms",
] as const;

const STATUSES: string[] = Object.values(STATUS);

export type ValidationResult = { ok: true; reading: RawReading } | { ok: false; error: string };

/**
 * Validates one incoming reading. Only `unit_id` is required; numbers may be null
 * (a disconnected sensor), `timestamp` defaults to now (ISO string or epoch ms).
 * `health_score` is accepted as an alias of `health_pct`. `status` (healthy/degraded)
 * is derived from `sentinel_status` when the device doesn't send it.
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
    const v = f === "health_pct" ? (r.health_pct ?? r.health_score) : r[f];
    if (v == null) nums[f] = null;
    else if (typeof v === "number" && Number.isFinite(v)) nums[f] = v;
    else return { ok: false, error: `${at}.${f}: must be a number or null` };
  }

  const health = nums.health_pct ?? null;
  if (health != null && (health < 0 || health > 100)) return { ok: false, error: `${at}.health_pct: 0–100` };
  let status = r.sentinel_status == null ? (health == null ? STATUS.LEARNING : STATUS.NORMAL) : String(r.sentinel_status);
  status = status.toUpperCase();
  if (!STATUSES.includes(status)) {
    return { ok: false, error: `${at}.sentinel_status: one of ${STATUSES.join(", ")}` };
  }

  let health_status: HealthStatus | null =
    status === STATUS.MAINTENANCE ? "degraded" : status === STATUS.NORMAL ? "healthy" : null;
  if (r.status != null) {
    const s = String(r.status).toLowerCase();
    if (s !== "healthy" && s !== "degraded") return { ok: false, error: `${at}.status: "healthy" or "degraded"` };
    health_status = s;
  }

  return {
    ok: true,
    reading: {
      timestamp: new Date(t).toISOString(),
      unit_id: r.unit_id.trim(),
      temperature: nums.temperature ?? null,
      current: nums.current ?? null,
      vibration: nums.vibration ?? null,
      baseline_temperature: nums.baseline_temperature ?? null,
      baseline_current: nums.baseline_current ?? null,
      baseline_vibration: nums.baseline_vibration ?? null,
      temp_score: nums.temp_score ?? null,
      current_score: nums.current_score ?? null,
      vibration_score: nums.vibration_score ?? null,
      health_pct: health,
      status: health_status,
      sentinel_status: status,
      real_condition: r.real_condition == null ? null : String(r.real_condition),
      processing_ms: nums.processing_ms ?? null,
    },
  };
}

const READING_COLUMNS = [
  "timestamp",
  "unit_id",
  ...NUMERIC_FIELDS,
  "status",
  "sentinel_status",
  "real_condition",
] as const;

export type ReadingSource = "device" | "simulator";

/** Inserts readings (one transaction) and bumps each unit's last_seen. */
export function addReadings(readings: RawReading[], source: ReadingSource = "device") {
  if (!readings.length) return;
  const conn = db();
  const insert = conn.prepare(
    `INSERT INTO readings (t, source, ${READING_COLUMNS.join(", ")})
     VALUES (?, ?, ${READING_COLUMNS.map(() => "?").join(", ")})`
  );
  const seen = conn.prepare(
    `INSERT INTO units (unit_id, last_seen) VALUES (?, ?)
     ON CONFLICT(unit_id) DO UPDATE SET last_seen = MAX(COALESCE(last_seen, ''), excluded.last_seen)`
  );
  const latest = new Map<string, string>();
  transaction(() => {
    for (const r of readings) {
      insert.run(Date.parse(r.timestamp), source, ...READING_COLUMNS.map((c) => r[c] ?? null));
      if ((latest.get(r.unit_id) ?? "") < r.timestamp) latest.set(r.unit_id, r.timestamp);
    }
    for (const [unit, ts] of latest) seen.run(unit, ts);
  });
}

/** Readings ascending by time. Without `since`, returns the most recent `limit` (default 5000). */
export function queryReadings({ since, unitId, limit }: { since?: number; unitId?: string; limit?: number }): RawReading[] {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (since != null) {
    where.push("t > ?");
    args.push(since);
  }
  if (unitId) {
    where.push("unit_id = ?");
    args.push(unitId);
  }
  const cap = limit ?? (since == null ? 5000 : 50_000);
  const sql = `SELECT ${READING_COLUMNS.join(", ")} FROM (
      SELECT * FROM readings ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY t DESC, id DESC LIMIT ?
    ) ORDER BY t ASC, id ASC`;
  return db().prepare(sql).all(...args, cap) as unknown as RawReading[];
}

export function upsertUnit(info: DeviceInfo) {
  db()
    .prepare(
      `INSERT INTO units (unit_id, chip, ram_used_kb, ram_total_kb, flash_used_kb, flash_total_kb)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(unit_id) DO UPDATE SET
         chip = COALESCE(excluded.chip, chip),
         ram_used_kb = COALESCE(excluded.ram_used_kb, ram_used_kb),
         ram_total_kb = COALESCE(excluded.ram_total_kb, ram_total_kb),
         flash_used_kb = COALESCE(excluded.flash_used_kb, flash_used_kb),
         flash_total_kb = COALESCE(excluded.flash_total_kb, flash_total_kb)`
    )
    .run(
      info.unit_id,
      info.chip ?? null,
      info.ram_used_kb ?? null,
      info.ram_total_kb ?? null,
      info.flash_used_kb ?? null,
      info.flash_total_kb ?? null
    );
}

export function listUnits() {
  return db().prepare("SELECT * FROM units ORDER BY unit_id").all();
}

export function stats() {
  const conn = db();
  const total = conn.prepare("SELECT COUNT(*) AS n, MIN(timestamp) AS first, MAX(timestamp) AS last FROM readings").get();
  const bySource = conn.prepare("SELECT source, COUNT(*) AS n FROM readings GROUP BY source").all();
  return { ...total, by_source: bySource };
}

export function clearStore() {
  transaction(() => {
    db().exec("DELETE FROM readings; DELETE FROM units;");
  });
}
