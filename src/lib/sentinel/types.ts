export type HealthStatus = "healthy" | "degraded";

/** One reading as stored in the database (plus the per-unit baselines the API adds). */
export interface RawReading {
  timestamp: string;
  unit_id: string;
  // A sensor that is disconnected or failing reports null.
  temperature: number | null;
  current: number | null;
  vibration: number | null;
  /** "healthy" | "degraded"; null while the unit is learning its baseline. */
  status: HealthStatus | null;
  /** Health in percent: 100 − (0.40·S_I + 0.35·S_T + 0.25·S_V). */
  health_pct: number | null;
  // Learned normal values, computed per unit by the API (not stored per row).
  baseline_temperature: number | null;
  baseline_current: number | null;
  baseline_vibration: number | null;
}

export interface Reading extends RawReading {
  /** timestamp as epoch ms, added on ingest */
  t: number;
}

export interface DeviceInfo {
  unit_id: string;
  chip?: string;
  ram_used_kb?: number;
  ram_total_kb?: number;
  flash_used_kb?: number;
  flash_total_kb?: number;
}
