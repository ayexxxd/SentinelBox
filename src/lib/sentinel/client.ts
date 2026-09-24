// The only module that knows how data reaches the dashboard.
//
// Endpoints assumed until the API ships - adjust paths here if they differ:
//   GET /readings?since=<ISO timestamp>  -> RawReading[]  (all units, ascending)
//   GET /units                           -> DeviceInfo[]  (optional)

import { API_URL, USE_MOCK } from "./config";
import * as mock from "./mock";
import type { DeviceInfo, RawReading, Reading } from "./types";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${path}`);
  return res.json() as Promise<T>;
}

export async function fetchReadings(since?: number | null): Promise<Reading[]> {
  const raw = USE_MOCK
    ? mock.getReadings(since)
    : await getJson<RawReading[]>(
        `/readings${since ? `?since=${encodeURIComponent(new Date(since).toISOString())}` : ""}`
      );
  return raw.map((r) => ({ ...r, t: new Date(r.timestamp).getTime() })).sort((a, b) => a.t - b.t);
}

export async function fetchUnits(): Promise<DeviceInfo[]> {
  if (USE_MOCK) return mock.getUnits();
  try {
    return await getJson<DeviceInfo[]>("/units");
  } catch {
    return []; // device info is optional
  }
}
