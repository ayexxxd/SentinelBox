"use client";

import { fmtTime } from "@/lib/sentinel/format";
import { Cpu, ScanEye } from "lucide-react";
import Link from "next/link";
import { useSentinel } from "./SentinelProvider";

export default function Navbar() {
  const { isMock, error, lastUpdate } = useSentinel();
  const source = isMock ? "Simulated data" : error ? "API unreachable" : "Live";
  const dot = isMock ? "bg-sky-400" : error ? "bg-orange-400" : "bg-emerald-400";

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#060b16]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-teal-400 shadow-[0_0_24px_rgba(45,212,191,0.35)]">
            <ScanEye className="h-5 w-5 text-white" strokeWidth={2.2} />
          </span>
          <span className="leading-tight">
            <span className="block text-[16px] font-bold tracking-tight text-white">Sentinel Insight</span>
            <span className="block text-[10px] uppercase tracking-[0.2em] text-slate-400">CETEC · HVAC health</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-300 sm:inline-flex">
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            {source}
            {lastUpdate && <span className="text-slate-500">· {fmtTime(lastUpdate)}</span>}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1.5 text-[11px] font-semibold text-teal-200">
            <Cpu className="h-3.5 w-3.5" />
            SentinelBox Edge AI
          </span>
        </div>
      </div>
    </header>
  );
}
