"use client";

import Navbar from "@/components/Navbar";
import SummaryPanel from "@/components/SummaryPanel";
import { BUILDING } from "@/data/sentinel";
import { MousePointerClick, Move3d, ZoomIn } from "lucide-react";
import dynamic from "next/dynamic";

const BuildingScene = dynamic(
  () => import("@/components/three/BuildingScene"),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full w-full place-items-center bg-[#0a1326]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-300" />
          <p className="text-sm text-slate-400">Loading 3D building…</p>
        </div>
      </div>
    ),
  }
);

export default function Home() {
  return (
    <div className="min-h-screen">
      <Navbar />

      <main>
        {/* Hero header */}
        <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                CEDES Digital Twin
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                {BUILDING.campus} · {BUILDING.location} — live rooftop HVAC
                monitoring preview
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                <Move3d className="h-3 w-3 text-sky-300" /> Drag to orbit
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                <ZoomIn className="h-3 w-3 text-sky-300" /> Scroll to zoom
              </span>
              <span className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 sm:inline-flex">
                <MousePointerClick className="h-3 w-3 text-sky-300" /> Click a unit
              </span>
            </div>
          </div>
        </div>

        {/* 3D hero */}
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 shadow-[0_20px_80px_rgba(2,132,199,0.15)]">
            <div className="tech-grid pointer-events-none absolute inset-0 z-10" />
            <div className="h-[560px] w-full sm:h-[620px]">
              <BuildingScene />
            </div>

            {/* Overlay: building chip */}
            <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-2xl border border-white/15 bg-[#060b16]/80 px-4 py-3 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300">
                Edificio CEDES
              </p>
              <p className="mt-0.5 text-sm font-bold text-white">
                2 rooftop units · SentinelBox monitored
              </p>
            </div>

            {/* Overlay: hint */}
            <div className="pointer-events-none absolute bottom-4 left-4 z-20 hidden rounded-full border border-white/15 bg-[#060b16]/80 px-3.5 py-2 text-xs text-slate-300 backdrop-blur sm:block">
              Hover a glowing pill for status — click to open the unit dashboard
              · toggle Rooftop / Torre up top
            </div>
            <div className="pointer-events-none absolute bottom-4 right-4 z-20 rounded-full border border-white/15 bg-[#060b16]/80 px-3.5 py-2 text-xs text-slate-300 backdrop-blur">
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-400" />
              HVAC-01 Healthy
              <span className="mx-2 text-slate-600">|</span>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-orange-400" />
              HVAC-02 Attention
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="pt-6">
          <SummaryPanel />
        </div>
      </main>

      <footer className="border-t border-white/10 py-6">
        <p className="mx-auto max-w-7xl px-4 text-xs text-slate-500 sm:px-6">
          SentinelBox hackathon prototype — 3D visualization with mock telemetry.
          No real sensor connection yet.
        </p>
      </footer>
    </div>
  );
}
