export type HvacStatus = "healthy" | "maintenance" | "offline";

export interface HvacUnit {
  id: string; // e.g. "hvac-01"
  label: string; // e.g. "HVAC-01"
  route: string; // e.g. "/hvac/hvac-01"
  status: HvacStatus;
  statusLabel: string;
  shortMessage: string;
  position: [number, number, number]; // rooftop placement in 3D scene
  telemetry: {
    temperature: { value: number; unit: string; baseline: number };
    current: { value: number; unit: string; baseline: number };
    vibration: { value: number; unit: string; baseline: number };
    anomalyScore: { value: number; unit: string };
    healthScore: number;
  };
  spark: {
    temperature: number[];
    current: number[];
    vibration: number[];
    anomaly: number[];
  };
}

export interface BuildingInfo {
  name: string;
  location: string;
  campus: string;
  monitoredUnits: number;
  sentinelDevices: number;
}

function series(base: number, amp: number, n = 24, drift = 0): number[] {
  return Array.from({ length: n }, (_, i) => {
    const wave =
      Math.sin(i / 2.4) * amp + Math.cos(i / 5.1) * (amp * 0.5);
    return +(base + wave + i * drift).toFixed(2);
  });
}

export const BUILDING: BuildingInfo = {
  name: "CEDES",
  location: "Monterrey, México",
  campus: "Tecnológico de Monterrey",
  monitoredUnits: 2,
  sentinelDevices: 1,
};

export const HVAC_UNITS: HvacUnit[] = [
  {
    id: "hvac-01",
    label: "HVAC-01",
    route: "/hvac/hvac-01",
    status: "healthy",
    statusLabel: "Healthy",
    shortMessage: "All signals nominal. Baseline stable.",
    position: [-3.4, 0, -1.2],
    telemetry: {
      temperature: { value: 22.4, unit: "°C", baseline: 22.1 },
      current: { value: 4.31, unit: "A", baseline: 4.28 },
      vibration: { value: 1.12, unit: "mm/s", baseline: 1.05 },
      anomalyScore: { value: 8, unit: "/100" },
      healthScore: 94,
    },
    spark: {
      temperature: series(22.2, 0.7),
      current: series(4.3, 0.18),
      vibration: series(1.1, 0.22),
      anomaly: series(9, 4),
    },
  },
  {
    id: "hvac-02",
    label: "HVAC-02",
    route: "/hvac/hvac-02",
    status: "maintenance",
    statusLabel: "Maintenance Required",
    shortMessage: "Current drift + vibration rise. Inspect soon.",
    position: [3.2, 0, 0.8],
    telemetry: {
      temperature: { value: 26.8, unit: "°C", baseline: 22.6 },
      current: { value: 5.92, unit: "A", baseline: 4.95 },
      vibration: { value: 3.48, unit: "mm/s", baseline: 1.18 },
      anomalyScore: { value: 76, unit: "/100" },
      healthScore: 42,
    },
    spark: {
      temperature: series(24.5, 1.1, 24, 0.09),
      current: series(5.3, 0.4, 24, 0.025),
      vibration: series(2.4, 0.6, 24, 0.045),
      anomaly: series(48, 12, 24, 1.1),
    },
  },
];

export const STATUS_META: Record<
  HvacStatus,
  { color: string; dot: string; ring: string; text: string; hex: string }
> = {
  healthy: {
    color: "bg-emerald-500",
    dot: "bg-emerald-400",
    ring: "ring-emerald-400/40",
    text: "text-emerald-300",
    hex: "#34d399",
  },
  maintenance: {
    color: "bg-orange-500",
    dot: "bg-orange-400",
    ring: "ring-orange-400/40",
    text: "text-orange-300",
    hex: "#fb923c",
  },
  offline: {
    color: "bg-slate-500",
    dot: "bg-slate-400",
    ring: "ring-slate-400/40",
    text: "text-slate-300",
    hex: "#94a3b8",
  },
};

export function getHvacById(id: string): HvacUnit | undefined {
  return HVAC_UNITS.find((u) => u.id === id);
}

export const onlineCount = HVAC_UNITS.filter(
  (u) => u.status !== "offline"
).length;
export const attentionCount = HVAC_UNITS.filter(
  (u) => u.status === "maintenance"
).length;
