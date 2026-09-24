export type HealthStatus = "healthy" | "warning" | "degraded";

/** One reading as stored in the database (plus the per-unit baselines the API adds). */
export interface RawReading {
  timestamp: string;
  unit_id: string;
  // A sensor that is disconnected or failing reports null.
  temperature: number | null;
  current: number | null;
  vibration: number | null;
  /** "healthy" | "warning" | "degraded"; null while the unit is learning its baseline. */
  status: HealthStatus | null;
  /** Health in percent, from the SentinelBox neural network (100 = the unit's learned normal). */
  health_pct: number | null;
  /** Why: health lost (0–100) when only that sensor deviates from its normal. */
  temp_score: number | null;
  current_score: number | null;
  vibration_score: number | null;
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
