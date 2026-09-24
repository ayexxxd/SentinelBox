"use client";

import { type HvacUnit } from "@/data/sentinel";
import { fmtNum } from "@/lib/sentinel/format";
import { Activity, CircleCheck, Gauge, Loader, Thermometer, Wrench, X, Zap, type LucideIcon } from "lucide-react";
import { useUnitLive, type SensorLive } from "./SentinelProvider";

const ICONS: Record<string, LucideIcon> = {
  temperature: Thermometer,
  current: Zap,
  pressure: Gauge,
  vibration: Activity,
};

function ago(t: number | null, now: number | null) {
  if (t == null || now == null) return "never";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ${s % 60}s ago`;
}

function SensorCard({ s, now }: { s: SensorLive; now: number | null }) {
  const Icon = ICONS[s.sensor.key] ?? Activity;
  return (
    <div
      className={`rounded-xl border p-4 transition ${
        s.alive ? "border-emerald-400/25 bg-emerald-400/[0.04]" : "border-red-400/40 bg-red-500/[0.06]"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${s.alive ? "bg-emerald-400/10 text-emerald-300" : "bg-red-400/10 text-red-300"}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
            s.alive ? "bg-emerald-400/10 text-emerald-300" : "bg-red-400/10 text-red-300"
          }`}
        >
          <span className="relative flex h-2 w-2">
            {s.alive && <span className="sentinel-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400" />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${s.alive ? "bg-emerald-400" : "bg-red-400"}`} />
          </span>
          {s.alive ? "Alive" : "Offline"}
        </span>
      </div>
      <p className="mt-3 text-xs text-slate-400">{s.sensor.label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-white">
        {s.alive ? fmtNum(s.value, s.sensor.decimals) : "—"}
        <span className="ml-1 text-sm font-normal text-slate-500">{s.sensor.unit}</span>
      </p>
      <p className="mt-1 text-[11px] text-slate-500">{s.alive ? "reporting" : `last reading ${ago(s.lastSeen, now)}`}</p>
    </div>
  );
}

/** In-scene panel for one HVAC unit: maintenance verdict + liveness of its four sensors. */
export default function UnitPanel({ unit, onClose }: { unit: HvacUnit; onClose: () => void }) {
  const { status, sensors, lastUpdate } = useUnitLive(unit.label);
  const offline = sensors.filter((s) => !s.alive);

  const verdict =
    status === "maintenance"
      ? {
          Icon: Wrench,
          title: "Maintenance required",
          detail: "Sensor readings stayed outside this unit's learned normal behavior in 3 of the last 5 readings.",
          cls: "border-orange-400/40 bg-orange-500/10 text-orange-200",
          icon: "bg-orange-400 text-[#1a0d02]",
        }
      : status === "healthy"
        ? {
            Icon: CircleCheck,
            title: "No maintenance needed",
            detail: "The unit is operating within its learned normal behavior.",
            cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
            icon: "bg-emerald-400 text-[#022012]",
          }
        : {
            Icon: Loader,
            title: status === "learning" ? "Learning normal behavior" : "No data from this unit",
            detail: status === "learning" ? "SentinelBox is collecting baseline samples." : "The SentinelBox device is not reporting.",
            cls: "border-sky-400/30 bg-sky-500/10 text-sky-200",
            icon: "bg-sky-400 text-[#021624]",
          };

  return (
    <aside className="pointer-events-auto flex max-h-full w-full flex-col overflow-y-auto rounded-2xl border border-white/15 bg-[#060b16]/90 p-5 shadow-2xl backdrop-blur-xl sm:w-[400px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] tracking-[0.22em] text-teal-300/80">CETEC · {unit.description.toUpperCase()}</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">{unit.label}</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className={`mt-4 flex items-start gap-3 rounded-xl border p-4 ${verdict.cls}`}>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${verdict.icon}`}>
          <verdict.Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-base font-bold text-white">{verdict.title}</p>
          <p className="mt-0.5 text-xs opacity-80">{verdict.detail}</p>
          {offline.length > 0 && (
            <p className="mt-2 text-xs text-red-300">
              {offline.length === 1 ? "1 sensor is" : `${offline.length} sensors are`} not reporting (
              {offline.map((s) => s.sensor.label.toLowerCase()).join(", ")}) — check the sensor wiring.
            </p>
          )}
        </div>
      </div>

      <h3 className="mt-5 text-xs font-semibold text-slate-300">
        Sensors <span className="text-slate-500">· {sensors.length - offline.length}/{sensors.length} alive</span>
      </h3>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {sensors.map((s) => (
          <SensorCard key={s.sensor.key} s={s} now={lastUpdate} />
        ))}
      </div>
    </aside>
  );
}
