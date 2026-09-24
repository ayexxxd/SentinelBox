export const API_URL = (process.env.NEXT_PUBLIC_SENTINEL_API_URL || "").replace(/\/$/, "");
export const USE_MOCK = !API_URL;
export const POLL_MS = Number(process.env.NEXT_PUBLIC_SENTINEL_POLL_MS) || 2000;

export const STATUS = {
  NORMAL: "NORMAL",
  MAINTENANCE: "MAINTENANCE REQUIRED",
  LEARNING: "LEARNING",
} as const;

export const RULES = {
  healthThreshold: 70, // HealthScore < 70 -> maintenance
  sensorScoreLimit: 80, // any single sensor score > 80 -> maintenance
  persistence: { hits: 3, window: 5 }, // 3 of the last 5 readings
  weights: { current: 0.4, temperature: 0.35, vibration: 0.25 },
};

/** A sensor counts as alive if its latest value is non-null and newer than this. */
export const SENSOR_STALE_MS = 10_000;

export type SensorKey = "temperature" | "current" | "vibration";

export interface SensorDef {
  key: SensorKey;
  label: string;
  unit: string;
  decimals: number;
  baselineField: "baseline_temperature" | "baseline_current" | "baseline_vibration";
}

// Sensors monitored by each SentinelBox unit.
export const SENSORS: SensorDef[] = [
  { key: "temperature", label: "Temperature", unit: "°C", decimals: 1, baselineField: "baseline_temperature" },
  { key: "current", label: "Current", unit: "A", decimals: 3, baselineField: "baseline_current" },
  { key: "vibration", label: "Vibration", unit: "mm/s", decimals: 2, baselineField: "baseline_vibration" },
];

/** |deviation| (%) from the learned baseline at which a reading is shown as elevated / abnormal. */
export const DEVIATION_BANDS = { elevated: 5, abnormal: 15 };
