"use client";

import { fetchReadings, fetchUnits } from "@/lib/sentinel/client";
import { POLL_MS, SENSOR_STALE_MS, SENSORS, USE_MOCK, type SensorDef, type SensorKey } from "@/lib/sentinel/config";
import type { DeviceInfo, Reading } from "@/lib/sentinel/types";
import type { HvacStatus } from "@/data/sentinel";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

const MAX_READINGS = 2000; // only the latest readings matter for live status

function groupByUnit(readings: Reading[]) {
  const map = new Map<string, Reading[]>();
  for (const r of readings) {
    if (!map.has(r.unit_id)) map.set(r.unit_id, []);
    map.get(r.unit_id)!.push(r);
  }
  return map;
}

interface SentinelData {
  readings: Reading[];
  byUnit: Map<string, Reading[]>;
  devices: DeviceInfo[];
  error: string | null;
  loading: boolean;
  lastUpdate: number | null;
  isMock: boolean;
}

const Ctx = createContext<SentinelData | null>(null);

// Loads the full history once, then polls for readings newer than the last one seen.
export function SentinelProvider({ children }: { children: React.ReactNode }) {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const lastT = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      try {
        const fresh = await fetchReadings(lastT.current);
        if (cancelled) return;
        if (fresh.length) {
          lastT.current = fresh[fresh.length - 1].t;
          setReadings((prev) => {
            const next = prev.concat(fresh);
            return next.length > MAX_READINGS ? next.slice(-MAX_READINGS) : next;
          });
        }
        setLastUpdate(Date.now());
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = setTimeout(tick, POLL_MS);
        }
      }
    }

    fetchUnits()
      .then((d) => !cancelled && setDevices(d))
      .catch(() => {});
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const value = useMemo<SentinelData>(
    () => ({ readings, byUnit: groupByUnit(readings), devices, error, loading, lastUpdate, isMock: USE_MOCK }),
    [readings, devices, error, loading, lastUpdate]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSentinel() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSentinel must be used inside <SentinelProvider>");
  return v;
}

/** Maps the firmware status string to the UI status used by badges and the 3D scene. */
export function toUiStatus(r: Reading | undefined): HvacStatus {
  if (!r) return "offline";
  if (r.status === "degraded") return "maintenance";
  if (r.status === "warning") return "warning";
  if (r.status == null) return "learning";
  return "healthy";
}

/** Score field sent by the SentinelBox for each sensor: health lost because of it (0–100). */
export const SCORE_FIELD = {
  temperature: "temp_score",
  current: "current_score",
  vibration: "vibration_score",
} as const;

/** Readings the "why" is averaged over, so a single noisy reading doesn't flip the cause. */
export const WHY_WINDOW = 3;

/** Average score per sensor over the last WHY_WINDOW readings that carry scores. */
export function sensorImpact(readings: Reading[]): Record<SensorKey, number | null> {
  const out = {} as Record<SensorKey, number | null>;
  for (const key of Object.keys(SCORE_FIELD) as SensorKey[]) {
    const vals: number[] = [];
    for (let i = readings.length - 1; i >= 0 && vals.length < WHY_WINDOW; i--) {
      const v = readings[i][SCORE_FIELD[key]];
      if (v != null) vals.push(v);
    }
    out[key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  return out;
}

export interface SensorLive {
  sensor: SensorDef;
  alive: boolean;
  value: number | null;
  /** Learned normal value (null while the baseline is being learned). */
  baseline: number | null;
  /** Deviation from the learned normal, in percent (signed). */
  deviation: number | null;
  /** Time of the last non-null value, if any was seen. */
  lastSeen: number | null;
  /** Health this sensor is costing (0–100), averaged over the last readings. */
  impact: number | null;
}

/** Liveness of every sensor on one unit, from its recent readings. */
export function sensorLiveness(readings: Reading[], now: number): SensorLive[] {
  const impact = sensorImpact(readings);
  return SENSORS.map((sensor) => {
    let lastSeen: number | null = null;
    let value: number | null = null;
    for (let i = readings.length - 1; i >= 0; i--) {
      const v = readings[i][sensor.key];
      if (v != null) {
        lastSeen = readings[i].t;
        value = v;
        break;
      }
    }
    const latest = readings.at(-1);
    const alive = latest != null && latest[sensor.key] != null && now - latest.t < SENSOR_STALE_MS;
    const baseline = latest?.[sensor.baselineField] ?? null;
    const deviation = alive && value != null && baseline ? ((value - baseline) / baseline) * 100 : null;
    return { sensor, alive, value: alive ? value : null, baseline, deviation, lastSeen, impact: impact[sensor.key] };
  });
}

/** Readings the health figure is taken over: median of the last N health values. */
export const HEALTH_WINDOW = 5;

/** Median of the last `HEALTH_WINDOW` health_pct values (ignores readings without one). */
export function healthMedian(readings: Reading[]): number | null {
  const vals: number[] = [];
  for (let i = readings.length - 1; i >= 0 && vals.length < HEALTH_WINDOW; i--) {
    const h = readings[i].health_pct;
    if (h != null) vals.push(h);
  }
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  const mid = vals.length >> 1;
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}

/** Latest reading, UI status, health (median of the last 5) and sensor liveness for one unit. */
export function useUnitLive(unitId: string) {
  const { byUnit, lastUpdate } = useSentinel();
  const rs = byUnit.get(unitId) ?? [];
  const latest = rs.at(-1);
  const sensors = sensorLiveness(rs, lastUpdate ?? 0);
  return { latest, status: toUiStatus(latest), health: healthMedian(rs), sensors, lastUpdate };
}
