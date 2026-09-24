// Reading schema from the project brief (README "Data schema"), without pressure.

export type HealthStatus = "healthy" | "degraded";
export interface RawReading {
  timestamp: string;
  unit_id: string;
  // A sensor that is disconnected or failing reports null.
  temperature: number | null;
  current: number | null;
  vibration: number | null;
  baseline_temperature: number | null;
  baseline_current: number | null;
  baseline_vibration: number | null;
  temp_score: number | null;
  current_score: number | null;
  vibration_score: number | null;
  /** Health in percent: 100 − (0.40·S_I + 0.35·S_T + 0.25·S_V). */
  health_pct: number | null;
  /** "healthy" | "degraded"; null while the baseline is being learned. */
  status: HealthStatus | null;
  sentinel_status: string;
  real_condition: string | null;
  processing_ms: number | null;
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
