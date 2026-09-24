"use client";

import MetricCard from "@/components/MetricCard";
import MockChart from "@/components/MockChart";
import StatusBadge from "@/components/StatusBadge";
import { STATUS_META, type HvacUnit } from "@/data/sentinel";
import { Activity, Fan, Gauge, Thermometer, Zap } from "lucide-react";

export default function HvacDetail({ unit }: { unit: HvacUnit }) {
  const meta = STATUS_META[unit.status];
  const t = unit.telemetry;

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300">
            CEDES · Rooftop unit
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
            {unit.label}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-slate-400">
            {unit.shortMessage} Placeholder telemetry below — wire to a real
            API later.
          </p>
        </div>
        <StatusBadge status={unit.status} label={unit.statusLabel} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          title="Temperature"
          value={t.temperature.value}
          unit={t.temperature.unit}
          baseline={t.temperature.baseline}
          hint="Supply air temp vs. learned baseline"
          icon={Thermometer}
          accent="#38bdf8"
        />
        <MetricCard
          title="Current"
          value={t.current.value}
          unit={t.current.unit}
          baseline={t.current.baseline}
          hint="Compressor draw vs. baseline"
          icon={Zap}
          accent="#facc15"
          delay={0.05}
        />
        <MetricCard
          title="Vibration"
          value={t.vibration.value}
          unit={t.vibration.unit}
          baseline={t.vibration.baseline}
          hint="Fan bearing RMS velocity"
          icon={Fan}
          accent="#fb923c"
          delay={0.1}
        />
        <MetricCard
          title="Anomaly score"
          value={t.anomalyScore.value}
          unit={t.anomalyScore.unit}
          hint={`Health score ${t.healthScore}/100`}
          icon={Activity}
          accent={meta.hex}
          delay={0.15}
        />
      </div>

      <h2 className="mt-10 text-sm font-bold uppercase tracking-[0.18em] text-slate-300">
        Telemetry Overview
      </h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {[
          { title: "Temperature (24h mock)", data: unit.spark.temperature, color: "#38bdf8", icon: Thermometer },
          { title: "Current (24h mock)", data: unit.spark.current, color: "#facc15", icon: Zap },
          { title: "Vibration (24h mock)", data: unit.spark.vibration, color: "#fb923c", icon: Gauge },
          { title: "Anomaly score (24h mock)", data: unit.spark.anomaly, color: meta.hex, icon: Activity },
        ].map((c) => (
          <div
            key={c.title}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <c.icon className="h-4 w-4" style={{ color: c.color }} />
                {c.title}
              </p>
              <span className="text-[11px] text-slate-500">mock data</span>
            </div>
            <MockChart data={[...c.data]} color={c.color} />
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-200">Health score</p>
          <p className="text-2xl font-bold text-white">
            {t.healthScore}
            <span className="text-sm font-medium text-slate-400">/100</span>
          </p>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${t.healthScore}%`,
              background: `linear-gradient(90deg, ${meta.hex}, ${meta.hex}99)`,
            }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {unit.status === "healthy"
            ? "Unit operating within learned baseline. No action needed."
            : unit.status === "maintenance"
              ? "Deviation persisted in recent readings. Schedule inspection of fan + electrical."
              : "Device not reporting. Check SentinelBox power and connectivity."}
        </p>
      </div>
    </>
  );
}
