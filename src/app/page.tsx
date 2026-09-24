"use client";

import Navbar from "@/components/Navbar";
import { toUiStatus, useSentinel } from "@/components/SentinelProvider";
import UnitPanel from "@/components/UnitPanel";
import { HVAC_UNITS, STATUS_META } from "@/data/sentinel";
import dynamic from "next/dynamic";
import { useState } from "react";

const BuildingScene = dynamic(() => import("@/components/three/BuildingScene"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-[#0a1326]">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-300" />
    </div>
  ),
});

export default function Home() {
  const { byUnit, lastUpdate } = useSentinel();
  const [selected, setSelected] = useState<string | null>(null);
  const unit = HVAC_UNITS.find((u) => u.id === selected);

  return (
    <div className="flex h-screen flex-col">
      <Navbar />
      <main className="relative flex-1 overflow-hidden">
        <BuildingScene selected={selected} onSelect={setSelected} />

        {unit && (
          <div className="pointer-events-none absolute inset-y-4 right-4 z-30 flex w-[min(600px,calc(100%-2rem))]">
            <UnitPanel unit={unit} onClose={() => setSelected(null)} />
          </div>
        )}

        {!unit && (
          <div className="pointer-events-none absolute bottom-4 right-4 z-20 flex flex-wrap gap-4 rounded-full border border-white/15 bg-[#060b16]/80 px-4 py-2 text-xs text-slate-300 backdrop-blur">
            {HVAC_UNITS.map((u) => {
              const meta = STATUS_META[toUiStatus(byUnit.get(u.label)?.at(-1), lastUpdate)];
              return (
                <span key={u.id} className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: meta.hex }} />
                  {u.label} · {meta.label}
                </span>
              );
            })}
            <span className="text-slate-500">Click a unit for details</span>
          </div>
        )}
      </main>
    </div>
  );
}
