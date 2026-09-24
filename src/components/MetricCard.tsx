"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

export default function MetricCard({
  title,
  value,
  unit,
  baseline,
  hint,
  icon: Icon,
  accent = "#38bdf8",
  delay = 0,
}: {
  title: string;
  value: number | string;
  unit?: string;
  baseline?: number | string;
  hint?: string;
  icon: LucideIcon;
  accent?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {title}
        </p>
        <span
          className="grid h-7 w-7 place-items-center rounded-lg"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-white">
        {value}
        {unit && (
          <span className="ml-1 text-sm font-medium text-slate-400">{unit}</span>
        )}
      </p>
      {baseline !== undefined && (
        <p className="mt-1 text-xs text-slate-400">
          Baseline{" "}
          <span className="font-semibold text-slate-200">
            {baseline}
            {unit}
          </span>
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </motion.div>
  );
}
