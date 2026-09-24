"use client";

import {
  BUILDING,
  STATUS_META,
  attentionCount,
  HVAC_UNITS,
  onlineCount,
} from "@/data/sentinel";
import { ArrowRight, Building2, Cpu, MapPin, Radio } from "lucide-react";
import Link from "next/link";
import StatusBadge from "./StatusBadge";

export default function SummaryPanel() {
  const stats = [
    { label: "Building", value: BUILDING.name, icon: Building2 },
    { label: "Location", value: BUILDING.location, icon: MapPin },
    {
      label: "Monitored HVAC Units",
      value: String(BUILDING.monitoredUnits),
      icon: Radio,
    },
    {
      label: "SentinelBox Devices",
      value: String(BUILDING.sentinelDevices),
      icon: Cpu,
    },
    { label: "Online Units", value: String(onlineCount), icon: Radio },
    {
      label: "Units Requiring Attention",
      value: String(attentionCount),
      icon: Building2,
    },
  ];

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Stats */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-300">
              Site summary
            </h2>
            <span className="text-xs text-slate-500">{BUILDING.campus}</span>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-white/10 bg-[#0a1326] p-3.5"
              >
                <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  <s.icon className="h-3.5 w-3.5 text-sky-400" />
                  {s.label}
                </dt>
                <dd className="mt-1 text-lg font-bold text-white">{s.value}</dd>
              </div>
            ))}
          </dl>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Legend
            </span>
            {(
              [
                ["healthy", "Healthy"],
                ["maintenance", "Maintenance Needed"],
                ["offline", "No Connection"],
              ] as const
            ).map(([key, label]) => (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300"
              >
                <span
                  className={`h-2 w-2 rounded-full ${STATUS_META[key].color}`}
                />
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Unit cards */}
        <div className="flex flex-col gap-3">
          {HVAC_UNITS.map((u) => (
            <Link
              key={u.id}
              href={u.route}
              className="group flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-4 transition hover:border-sky-400/40 hover:bg-white/[0.07]"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-base font-bold text-white">{u.label}</p>
                  <StatusBadge
                    status={u.status}
                    label={u.statusLabel}
                    size="sm"
                  />
                </div>
                <p className="mt-1 max-w-[280px] text-[13px] leading-snug text-slate-400">
                  {u.shortMessage}
                </p>
              </div>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition group-hover:border-sky-400/50 group-hover:text-sky-300">
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
          <p className="px-1 text-xs leading-relaxed text-slate-500">
            Tip: click a rooftop unit — or its floating status pill — directly
            in the 3D scene to open its dashboard.
          </p>
        </div>
      </div>
    </section>
  );
}
