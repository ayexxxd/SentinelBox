// SQLite connection (Node's built-in node:sqlite, no native dependencies).
// Server-only: imported by route handlers. The file lives at data/sentinel.db unless
// SENTINEL_DB_PATH is set. Schema is created on first use.

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = /* sql */ `
  CREATE TABLE IF NOT EXISTS readings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id     TEXT NOT NULL,
    timestamp   TEXT NOT NULL,                                     -- ISO 8601 UTC
    temperature REAL,                                              -- °C, NULL = sensor offline
    current     REAL,                                              -- A
    vibration   REAL,                                              -- mm/s
    status      TEXT CHECK (status IN ('healthy', 'warning', 'degraded')), -- NULL while learning
    health_pct  REAL CHECK (health_pct BETWEEN 0 AND 100),         -- health condition, %
    temp_score      REAL CHECK (temp_score BETWEEN 0 AND 100),     -- health lost due to each sensor
    current_score   REAL CHECK (current_score BETWEEN 0 AND 100),
    vibration_score REAL CHECK (vibration_score BETWEEN 0 AND 100)
  );
  CREATE INDEX IF NOT EXISTS readings_ts ON readings (timestamp);
  CREATE INDEX IF NOT EXISTS readings_unit_ts ON readings (unit_id, timestamp);

  CREATE TABLE IF NOT EXISTS units (
    unit_id        TEXT PRIMARY KEY,
    chip           TEXT,
    ram_used_kb    REAL,
    ram_total_kb   REAL,
    flash_used_kb  REAL,
    flash_total_kb REAL,
    last_seen      TEXT
  );
`;

// Bump when the schema changes. Older databases are rebuilt (they only hold prototype data).
const SCHEMA_VERSION = 4;

const g = globalThis as unknown as { __sentinelDb?: DatabaseSync; __sentinelDbVersion?: number };

export function db(): DatabaseSync {
  if (g.__sentinelDb && g.__sentinelDbVersion === SCHEMA_VERSION) return g.__sentinelDb;
  g.__sentinelDb?.close(); // connection from before a schema change (dev hot reload)
  const file = process.env.SENTINEL_DB_PATH || path.join(process.cwd(), "data", "sentinel.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new DatabaseSync(file);
  conn.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  const { user_version } = conn.prepare("PRAGMA user_version").get() as { user_version: number };
  if (user_version !== SCHEMA_VERSION) {
    conn.exec("DROP TABLE IF EXISTS readings; DROP TABLE IF EXISTS units;");
    conn.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
  conn.exec(SCHEMA);
  g.__sentinelDb = conn;
  g.__sentinelDbVersion = SCHEMA_VERSION;
  return conn;
}

/** Runs `fn` inside a transaction (rolls back on error). */
export function transaction<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN");
  try {
    const out = fn();
    conn.exec("COMMIT");
    return out;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}
