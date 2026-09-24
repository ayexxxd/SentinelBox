"use client";

import { Box, Cpu } from "lucide-react";
import Link from "next/link";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#060b16]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 shadow-[0_0_24px_rgba(56,189,248,0.45)]">
            <Box className="h-5 w-5 text-white" strokeWidth={2.2} />
          </span>
          <span className="leading-tight">
            <span className="block text-[17px] font-bold tracking-tight text-white">
              SentinelBox
            </span>
            <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
              Intelligent HVAC Maintenance
            </span>
          </span>
        </Link>

        <div className="hidden items-center gap-2 md:flex">
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">
            3D Building View
          </span>
          <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 lg:inline-flex">
            CEDES · Monterrey, MX
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
            <Cpu className="h-3.5 w-3.5" />
            Edge AI Demo
          </span>
        </div>
      </div>
    </header>
  );
}
