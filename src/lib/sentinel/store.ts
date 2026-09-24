// Server-side store for SentinelBox readings and device info, backed by SQLite
// (see db.ts). Route handlers call these functions; nothing else touches SQL.

import { STATUS } from "./config";
import { db, transaction } from "./db";
import type { DeviceInfo, HealthStatus, RawReading } from "./types";

/** Readings per unit that define its learned normal (≈ 90 s at one reading every 2 s). */
export const BASELINE_READINGS = 45;

/** The columns actually stored for each reading. */
export type StoredReading = Pick<
  RawReading,
  "timestamp" | "unit_id" | "temperature" | "current" | "vibration" | "status" | "health_pct"
>;

const SENSOR_FIELDS = ["temperature", "current", "vibration"] as const;

export type ValidationResult =
  | { ok: true; reading: StoredReading; clockFixed: boolean }
  | { ok: false; error: string };

/** Device timestamps outside this window are treated as a bad clock and replaced by server time. */
const EARLIEST_VALID = Date.UTC(2024, 0, 1); // an ESP without NTP starts at 1970
const MAX_FUTURE_MS = 60_000;

/**
 * Validates one incoming reading. Only `unit_id` is required; sensor values may be null
 * (a disconnected sensor); `timestamp` defaults to now (ISO string or epoch ms). A timestamp
 * before 2024 or more than a minute in the future is replaced by server time.
 * `health_score` is accepted as an alias of `health_pct`. If `status` is missing it is
 * derived from `sentinel_status` (NORMAL → healthy, MAINTENANCE REQUIRED → degraded).
 * Any other fields are ignored.
 */
export function validateReading(input: unknown, index = 0): ValidationResult {
  const at = `readings[${index}]`;
  if (!input || typeof input !== "object") return { ok: false, error: `${at}: must be an object` };
  const r = input as Record<string, unknown>;

  if (typeof r.unit_id !== "string" || !r.unit_id.trim() || r.unit_id.length > 64) {
    return { ok: false, error: `${at}.unit_id: required string (max 64 chars)` };
  }

  const now = Date.now();
  let t = now;
  let clockFixed = false;
  if (r.timestamp != null) {
    t = typeof r.timestamp === "number" ? r.timestamp : Date.parse(String(r.timestamp));
    if (!Number.isFinite(t)) return { ok: false, error: `${at}.timestamp: must be ISO 8601 or epoch ms` };
    // Unsynced or drifting device clock: keep the reading, stamp it with server time.
    if (t < EARLIEST_VALID || t > now + MAX_FUTURE_MS) {
      t = now;
      clockFixed = true;
    }
  }

  const num = (field: string, v: unknown): number | null | string => {
    if (v == null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    return `${at}.${field}: must be a number or null`;
  };
  const sensors = {} as Record<(typeof SENSOR_FIELDS)[number], number | null>;
  for (const f of SENSOR_FIELDS) {
    const v = num(f, r[f]);
    if (typeof v === "string") return { ok: false, error: v };
    sensors[f] = v;
  }
  const health = num("health_pct", r.health_pct ?? r.health_score);
  if (typeof health === "string") return { ok: false, error: health };
  if (health != null && (health < 0 || health > 100)) return { ok: false, error: `${at}.health_pct: 0–100` };

  let status: HealthStatus | null = null;
  if (r.status != null) {
    const s = String(r.status).toLowerCase();
    if (s !== "healthy" && s !== "degraded") return { ok: false, error: `${at}.status: "healthy" or "degraded"` };
    status = s;
  } else if (r.sentinel_status != null) {
    const s = String(r.sentinel_status).toUpperCase();
    status = s === STATUS.MAINTENANCE ? "degraded" : s === STATUS.NORMAL ? "healthy" : null;
  } else if (health != null) {
    status = "healthy";
  }

  return {
    ok: true,
    clockFixed,
    reading: {
      timestamp: new Date(t).toISOString(),
      unit_id: r.unit_id.trim(),
      ...sensors,
      status,
      health_pct: health,
    },
  };
}

const COLUMNS = ["unit_id", "timestamp", "temperature", "current", "vibration", "status", "health_pct"] as const;

/** Readings older than this are deleted automatically. 0 disables cleanup. */
export const RETENTION_DAYS = Number(process.env.SENTINEL_RETENTION_DAYS ?? 7);
const PRUNE_EVERY_MS = 10 * 60_000;
const g = globalThis as unknown as { __sentinelLastPrune?: number };

/** Deletes readings older than RETENTION_DAYS (at most once every 10 minutes unless forced). */
export function pruneOldReadings(force = false): number {
  if (!(RETENTION_DAYS > 0)) return 0;
  const now = Date.now();
  if (!force && g.__sentinelLastPrune && now - g.__sentinelLastPrune < PRUNE_EVERY_MS) return 0;
  g.__sentinelLastPrune = now;
  const cutoff = new Date(now - RETENTION_DAYS * 86_400_000).toISOString();
  const res = db().prepare("DELETE FROM readings WHERE timestamp < ?").run(cutoff);
  return Number(res.changes);
}

/** Inserts readings (one transaction) and bumps each unit's last_seen. */
export function addReadings(readings: StoredReading[]) {
  if (!readings.length) return;
  const conn = db();
  const insert = conn.prepare(`INSERT INTO readings (${COLUMNS.join(", ")}) VALUES (${COLUMNS.map(() => "?").join(", ")})`);
  const seen = conn.prepare(
    `INSERT INTO units (unit_id, last_seen) VALUES (?, ?)
     ON CONFLICT(unit_id) DO UPDATE SET last_seen = MAX(COALESCE(last_seen, ''), excluded.last_seen)`
  );
  const latest = new Map<string, string>();
  transaction(() => {
    for (const r of readings) {
      insert.run(...COLUMNS.map((c) => r[c] ?? null));
      if ((latest.get(r.unit_id) ?? "") < r.timestamp) latest.set(r.unit_id, r.timestamp);
    }
    for (const [unit, ts] of latest) seen.run(unit, ts);
  });
  pruneOldReadings();
}

/** All readings (optionally one unit) as CSV, oldest first. */
export function exportCsv(unitId?: string): string {
  const rows = db()
    .prepare(`SELECT id, ${COLUMNS.join(", ")} FROM readings ${unitId ? "WHERE unit_id = ?" : ""} ORDER BY timestamp, id`)
    .all(...(unitId ? [unitId] : [])) as Record<string, unknown>[];
  const header = ["id", ...COLUMNS];
  const cell = (v: unknown) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [header.join(","), ...rows.map((r) => header.map((h) => cell(r[h])).join(","))].join("\n") + "\n";
}

/**
 * Readings ascending by time, each with its unit's baseline: the average of that unit's
 * first BASELINE_READINGS readings (null until it has that many).
 * Without `since`, returns the most recent `limit` (default 5000).
 */
export function queryReadings({ since, unitId, limit }: { since?: number; unitId?: string; limit?: number }): RawReading[] {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (since != null) {
    where.push("timestamp > ?");
    args.push(new Date(since).toISOString());
  }
  if (unitId) {
    where.push("unit_id = ?");
    args.push(unitId);
  }
  const cap = limit ?? (since == null ? 5000 : 50_000);
  const sql = `
    WITH baselines AS (
      SELECT unit_id,
             ROUND(AVG(temperature), 2) AS baseline_temperature,
             ROUND(AVG(current), 4)     AS baseline_current,
             ROUND(AVG(vibration), 3)   AS baseline_vibration
      FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY unit_id ORDER BY timestamp, id) AS n FROM readings
      )
      WHERE n <= ${BASELINE_READINGS}
      GROUP BY unit_id
      HAVING COUNT(*) = ${BASELINE_READINGS}
    ),
    picked AS (
      SELECT * FROM readings ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY timestamp DESC, id DESC LIMIT ?
    )
    SELECT p.timestamp, p.unit_id, p.temperature, p.current, p.vibration, p.status, p.health_pct,
           b.baseline_temperature, b.baseline_current, b.baseline_vibration
    FROM picked p LEFT JOIN baselines b ON b.unit_id = p.unit_id
    ORDER BY p.timestamp ASC, p.id ASC`;
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
  const totals = db().prepare("SELECT COUNT(*) AS n, MIN(timestamp) AS first, MAX(timestamp) AS last FROM readings").get();
  return { ...totals, retention_days: RETENTION_DAYS };
}

export function clearStore() {
  transaction(() => {
    db().exec("DELETE FROM readings; DELETE FROM units;");
  });
}
