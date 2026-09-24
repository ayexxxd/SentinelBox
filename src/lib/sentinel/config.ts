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
  weights: { current: 0.4, temperature: 0.35, pressure: 0.25 },
};

/** A sensor counts as alive if its latest value is non-null and newer than this. */
export const SENSOR_STALE_MS = 10_000;

export type SensorKey = "temperature" | "current" | "pressure" | "vibration";

export interface SensorDef {
  key: SensorKey;
  label: string;
  unit: string;
  decimals: number;
}

export const SENSORS: SensorDef[] = [
  { key: "temperature", label: "Temperature", unit: "°C", decimals: 1 },
  { key: "current", label: "Current", unit: "A", decimals: 3 },
  { key: "pressure", label: "Pressure", unit: "Pa", decimals: 1 },
  { key: "vibration", label: "Vibration", unit: "mm/s", decimals: 2 },
];
