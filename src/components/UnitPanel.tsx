"use client";

import { type HvacUnit } from "@/data/sentinel";
import { DEVIATION_BANDS } from "@/lib/sentinel/config";
import { fmtNum, fmtSigned } from "@/lib/sentinel/format";
import { Activity, CircleCheck, Loader, Thermometer, Wrench, X, Zap, type LucideIcon } from "lucide-react";
import { useUnitLive, type SensorLive } from "./SentinelProvider";

const ICONS: Record<string, LucideIcon> = {
  temperature: Thermometer,
  current: Zap,
  vibration: Activity,
};

const BAR_RANGE = 40; // the deviation bar spans ±40 %

function ago(t: number | null, now: number | null) {
  if (t == null || now == null) return "never";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ${s % 60}s ago`;
}

function band(dev: number | null) {
  if (dev == null) return { label: "—", text: "text-slate-400", fill: "#64748b" };
  const a = Math.abs(dev);
  if (a >= DEVIATION_BANDS.abnormal) return { label: "Abnormal", text: "text-orange-300", fill: "#fb923c" };
  if (a >= DEVIATION_BANDS.elevated) return { label: "Elevated", text: "text-amber-200", fill: "#fcd34d" };
  return { label: "Normal", text: "text-emerald-300", fill: "#34d399" };
}

/** Diverging bar: center = learned normal, shaded band = normal range, fill = current deviation. */
function DeviationBar({ dev }: { dev: number | null }) {
  const b = band(dev);
  const clamp = (v: number) => Math.max(-BAR_RANGE, Math.min(BAR_RANGE, v));
  const pos = (v: number) => 50 + (clamp(v) / BAR_RANGE) * 50;
  const normalW = (DEVIATION_BANDS.elevated / BAR_RANGE) * 50;
  return (
    <div className="mt-3">
      <div className="relative h-2.5 rounded-full bg-white/[0.07]">
        <div className="absolute inset-y-0 rounded-full bg-emerald-400/15" style={{ left: `${50 - normalW}%`, width: `${normalW * 2}%` }} />
        {dev != null && (
          <div
            className="absolute inset-y-0 rounded-full transition-all duration-500"
            style={{ left: `${Math.min(50, pos(dev))}%`, width: `${Math.abs(pos(dev) - 50)}%`, background: b.fill }}
          />
        )}
        <div className="absolute -bottom-1 -top-1 left-1/2 w-0.5 -translate-x-1/2 rounded bg-slate-300/80" />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>−{BAR_RANGE}%</span>
        <span>normal</span>
        <span>+{BAR_RANGE}%</span>
      </div>
    </div>
  );
}

function SensorCard({ s, now }: { s: SensorLive; now: number | null }) {
  const Icon = ICONS[s.sensor.key] ?? Activity;
  const b = band(s.deviation);
  return (
    <div className={`rounded-2xl border p-5 transition ${s.alive ? "border-white/10 bg-white/[0.04]" : "border-red-400/40 bg-red-500/[0.07]"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`grid h-11 w-11 place-items-center rounded-xl ${s.alive ? "bg-sky-400/10 text-sky-300" : "bg-red-400/10 text-red-300"}`}>
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-semibold text-white">{s.sensor.label}</p>
            <p className="text-[11px] text-slate-500">
              normal {s.baseline == null ? "learning…" : `${fmtNum(s.baseline, s.sensor.decimals)} ${s.sensor.unit}`}
            </p>
          </div>
        </div>
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

      {s.alive ? (
        <>
          <div className="mt-4 flex items-end justify-between gap-4">
            <p className="text-3xl font-bold tabular-nums text-white">
              {fmtNum(s.value, s.sensor.decimals)}
              <span className="ml-1 text-base font-normal text-slate-500">{s.sensor.unit}</span>
            </p>
            <div className="text-right">
              <p className={`text-2xl font-bold tabular-nums ${b.text}`}>{fmtSigned(s.deviation)}</p>
              <p className={`text-[11px] ${b.text}`}>{s.deviation == null ? "no baseline yet" : `${b.label} · vs normal`}</p>
            </div>
          </div>
          <DeviationBar dev={s.deviation} />
        </>
      ) : (
        <p className="mt-4 text-sm text-red-300">Not reporting · last reading {ago(s.lastSeen, now)}</p>
      )}
    </div>
  );
}

/** In-scene panel for one HVAC unit: maintenance verdict + liveness and deviation of each sensor. */
export default function UnitPanel({ unit, onClose }: { unit: HvacUnit; onClose: () => void }) {
  const { status, sensors, lastUpdate } = useUnitLive(unit.label);
  const offline = sensors.filter((s) => !s.alive);

  const verdict =
    status === "maintenance"
      ? {
          Icon: Wrench,
          title: "Maintenance required",
          detail: "Readings stayed outside this unit's learned normal behavior in 3 of the last 5 readings.",
          cls: "border-orange-400/40 bg-orange-500/10 text-orange-100",
          icon: "bg-orange-400 text-[#1a0d02]",
        }
      : status === "healthy"
        ? {
            Icon: CircleCheck,
            title: "No maintenance needed",
            detail: "The unit is operating within its learned normal behavior.",
            cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
            icon: "bg-emerald-400 text-[#022012]",
          }
        : {
            Icon: Loader,
            title: status === "learning" ? "Learning normal behavior" : "No data from this unit",
            detail: status === "learning" ? "SentinelBox is collecting baseline samples." : "The SentinelBox device is not reporting.",
            cls: "border-sky-400/30 bg-sky-500/10 text-sky-100",
            icon: "bg-sky-400 text-[#021624]",
          };

  return (
    <aside className="pointer-events-auto flex h-full w-full flex-col overflow-y-auto rounded-3xl border border-white/15 bg-[#060b16]/90 p-7 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-[0.22em] text-teal-300/80">CETEC · {unit.description.toUpperCase()}</p>
          <h2 className="mt-1 text-4xl font-bold tracking-tight text-white">{unit.label}</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className={`mt-6 flex items-start gap-4 rounded-2xl border p-5 ${verdict.cls}`}>
        <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl ${verdict.icon}`}>
          <verdict.Icon className="h-7 w-7" />
        </span>
        <div>
          <p className="text-2xl font-bold text-white">{verdict.title}</p>
          <p className="mt-1 text-sm opacity-80">{verdict.detail}</p>
          {offline.length > 0 && (
            <p className="mt-2 text-sm text-red-300">
              {offline.length === 1 ? "1 sensor is" : `${offline.length} sensors are`} not reporting (
              {offline.map((s) => s.sensor.label.toLowerCase()).join(", ")}) — check the sensor wiring.
            </p>
          )}
        </div>
      </div>

      <h3 className="mt-7 text-sm font-semibold text-slate-300">
        Sensors <span className="text-slate-500">· {sensors.length - offline.length}/{sensors.length} alive</span>
      </h3>
      <div className="mt-3 flex flex-col gap-4">
        {sensors.map((s) => (
          <SensorCard key={s.sensor.key} s={s} now={lastUpdate} />
        ))}
      </div>
    </aside>
  );
}
