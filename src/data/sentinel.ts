// Static site description: which units exist and where they sit in the 3D model.
// Live telemetry, status and KPIs come from SentinelProvider (src/lib/sentinel).

export type HvacStatus = "healthy" | "maintenance" | "learning" | "offline";

export interface HvacUnit {
  id: string; // e.g. "hvac-01"
  label: string; // unit_id sent by the device, e.g. "HVAC-01"
  description: string;
  position: [number, number, number]; // placement on the mechanical terrace
}

export interface BuildingInfo {
  name: string;
  location: string;
  campus: string;
}

export const BUILDING: BuildingInfo = {
  name: "CETEC",
  location: "Monterrey, México",
  campus: "Tecnológico de Monterrey",
};

export const HVAC_UNITS: HvacUnit[] = [
  {
    id: "hvac-01",
    label: "HVAC-01",
    description: "Cooling tower · west cell",
    position: [13, 0, 2.5],
  },
  {
    id: "hvac-02",
    label: "HVAC-02",
    description: "Cooling tower · east cell",
    position: [23.5, 0, 2.5],
  },
];

export const STATUS_META: Record<
  HvacStatus,
  { label: string; color: string; text: string; hex: string; message: string }
> = {
  healthy: {
    label: "Normal",
    color: "bg-emerald-400",
    text: "text-emerald-300",
    hex: "#34d399",
    message: "Operating within its learned baseline.",
  },
  maintenance: {
    label: "Maintenance required",
    color: "bg-orange-400",
    text: "text-orange-300",
    hex: "#fb923c",
    message: "Deviation persisted in 3 of the last 5 readings.",
  },
  learning: {
    label: "Learning baseline",
    color: "bg-sky-400",
    text: "text-sky-300",
    hex: "#38bdf8",
    message: "Collecting normal-operation samples.",
  },
  offline: {
    label: "No data",
    color: "bg-slate-400",
    text: "text-slate-300",
    hex: "#94a3b8",
    message: "Device not reporting.",
  },
};

export function getHvacById(id: string): HvacUnit | undefined {
  return HVAC_UNITS.find((u) => u.id === id);
}
