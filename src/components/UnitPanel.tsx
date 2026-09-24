"use client";

import { type HvacUnit } from "@/data/sentinel";
import { HEALTH_BANDS } from "@/lib/sentinel/config";
import { fmtNum, fmtSigned } from "@/lib/sentinel/format";
import { Activity, CircleCheck, Loader, Thermometer, TriangleAlert, Wrench, X, Zap, type LucideIcon } from "lucide-react";
import { HEALTH_WINDOW, useUnitLive, type SensorLive } from "./SentinelProvider";

const ICONS: Record<string, LucideIcon> = {
  temperature: Thermometer,
  current: Zap,
  vibration: Activity,
};

function ago(t: number | null, now: number | null) {
  if (t == null || now == null) return "never";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ${s % 60}s ago`;
}

/** Health bar color follows the network's bands: normal / warning / maintenance. */
function healthTone(pct: number) {
  if (pct >= HEALTH_BANDS.warning) return { fill: "#34d399", text: "text-emerald-300", label: "Normal" };
  if (pct >= HEALTH_BANDS.maintenance) return { fill: "#fcd34d", text: "text-amber-200", label: "Warning range" };
  return { fill: "#fb923c", text: "text-orange-300", label: "Maintenance range" };
}

const MARKS = [
  { at: HEALTH_BANDS.maintenance, title: "Below this: maintenance range" },
  { at: HEALTH_BANDS.warning, title: "Below this: warning range" },
];

/** General health of the unit: median of its last 5 health_pct readings, as a 0–100 % bar. */
function HealthBar({ pct }: { pct: number | null }) {
  const tone = pct == null ? null : healthTone(pct);
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-300">Health</p>
          <p className="text-[11px] text-slate-500">
            {tone ? `${tone.label} · median of last ${HEALTH_WINDOW} readings` : "learning normal behavior…"}
          </p>
        </div>
        <p className={`text-4xl font-bold tabular-nums ${tone ? tone.text : "text-slate-500"}`}>
          {pct == null ? "—" : fmtNum(pct, 0)}
          <span className="ml-0.5 text-xl">%</span>
        </p>
      </div>
      <div className="relative mt-3 h-3 rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct ?? 0}%`, background: tone?.fill ?? "transparent" }}
        />
        {MARKS.map((m) => (
          <span
            key={m.at}
            className="absolute -bottom-1 -top-1 w-0.5 -translate-x-1/2 rounded bg-slate-300/70"
            style={{ left: `${m.at}%` }}
            title={m.title}
          />
        ))}
      </div>
      <div className="relative mt-1 h-3 text-[10px] text-slate-500">
        <span className="absolute left-0">0%</span>
        {MARKS.map((m) => (
          <span key={m.at} className="absolute -translate-x-1/2" style={{ left: `${m.at}%` }}>
            {m.at}%
          </span>
        ))}
        <span className="absolute right-0">100%</span>
      </div>
    </div>
  );
}

/** Impact (0–100) below this is treated as noise: the sensor is not a cause. */
const IMPACT_MIN = 15;

function impactTone(v: number) {
  if (v >= 60) return { fill: "#fb923c", text: "text-orange-300" };
  if (v >= IMPACT_MIN) return { fill: "#fcd34d", text: "text-amber-200" };
  return { fill: "#34d399", text: "text-emerald-300" };
}

/** "+4.2 °C vs normal (+17%)" for one sensor, or null if there is nothing to compare. */
function deltaText(s: SensorLive) {
  if (s.value == null || s.baseline == null) return null;
  const d = fmtSigned(s.value - s.baseline, s.sensor.decimals, ` ${s.sensor.unit}`);
  return s.deviation == null ? `${d} vs normal` : `${d} vs normal (${fmtSigned(s.deviation, 0)})`;
}

/**
 * Why the network flagged the unit: how much health each sensor is costing, from the
 * per-sensor scores the SentinelBox computes (the network run with only that sensor
 * deviating). Sorted by impact, so the technician sees the cause first.
 */
function WhyPanel({ sensors, status }: { sensors: SensorLive[]; status: string }) {
  const scored = sensors.filter((s) => s.impact != null).sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0));
  if (!scored.length) return null;
  const causes = scored.filter((s) => (s.impact ?? 0) >= IMPACT_MIN);
  const alerting = status === "warning" || status === "maintenance";
  const headline = causes.length
    ? `Cause: ${causes.map((s) => s.sensor.label.toLowerCase()).join(" + ")}`
    : alerting
      ? "No single sensor stands out"
      : "All sensors within their learned normal";

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-sm font-semibold text-slate-300">Why</p>
      <p className="text-[11px] text-slate-500">health each sensor is costing, per the SentinelBox neural network</p>
      <p className={`mt-3 text-lg font-semibold ${causes.length ? impactTone(causes[0].impact ?? 0).text : "text-emerald-300"}`}>
        {headline}
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {scored.map((s) => {
          const v = s.impact ?? 0;
          const tone = impactTone(v);
          const delta = deltaText(s);
          return (
            <div key={s.sensor.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-slate-200">{s.sensor.label}</span>
                <span className={`tabular-nums font-semibold ${tone.text}`}>{fmtNum(v, 0)}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-white/[0.08]">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${v}%`, background: tone.fill }} />
              </div>
              {delta && v >= IMPACT_MIN && <p className="mt-1 text-[11px] text-slate-400">{delta}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SensorCard({ s, now }: { s: SensorLive; now: number | null }) {
  const Icon = ICONS[s.sensor.key] ?? Activity;
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
        <p className="mt-4 text-3xl font-bold tabular-nums text-white">
          {fmtNum(s.value, s.sensor.decimals)}
          <span className="ml-1 text-base font-normal text-slate-500">{s.sensor.unit}</span>
        </p>
      ) : (
        <p className="mt-4 text-sm text-red-300">Not reporting · last reading {ago(s.lastSeen, now)}</p>
      )}
    </div>
  );
}

/** In-scene panel for one HVAC unit: maintenance verdict, health %, and each sensor's reading. */
export default function UnitPanel({ unit, onClose }: { unit: HvacUnit; onClose: () => void }) {
  const { status, sensors, lastUpdate, health } = useUnitLive(unit.label);
  const offline = sensors.filter((s) => !s.alive);

  const verdict =
    status === "warning"
      ? {
          Icon: TriangleAlert,
          title: "Warning: early degradation",
          detail: "The unit is drifting from its learned normal. No shutdown needed yet; plan an inspection.",
          cls: "border-amber-300/40 bg-amber-400/10 text-amber-50",
          icon: "bg-amber-300 text-[#1f1402]",
        }
      : status === "maintenance"
      ? {
          Icon: Wrench,
          title: "Maintenance required",
          detail: "This unit's SentinelBox reported it as degraded in its latest reading. Schedule an inspection.",
          cls: "border-orange-400/40 bg-orange-500/10 text-orange-100",
          icon: "bg-orange-400 text-[#1a0d02]",
        }
      : status === "healthy"
        ? {
            Icon: CircleCheck,
            title: "No maintenance needed",
            detail: "This unit's SentinelBox reported it as healthy in its latest reading.",
            cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
            icon: "bg-emerald-400 text-[#022012]",
          }
        : {
            Icon: Loader,
            title: status === "learning" ? "Learning normal behavior" : "No data from this unit",
            detail:
              status === "learning"
                ? "Readings are arriving, but the SentinelBox hasn't reported a health status yet."
                : "No readings have been received from this unit's SentinelBox.",
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

      <HealthBar pct={health} />

      <WhyPanel sensors={sensors} status={status} />

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
