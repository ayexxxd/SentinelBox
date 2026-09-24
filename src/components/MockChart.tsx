"use client";

import { useId } from "react";

export default function MockChart({
  data,
  color = "#38bdf8",
  height = 96,
  fill = true,
}: {
  data: number[];
  color?: string;
  height?: number;
  fill?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const w = 320;
  const h = 100;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - 8 - ((v - min) / span) * (h - 24);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;

  return (
    <div className="w-full overflow-hidden rounded-xl border border-white/10 bg-[#0a1222]">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="block w-full"
        style={{ height }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            x2={w}
            y1={h * f}
            y2={h * f}
            stroke="rgba(148,163,184,0.15)"
            strokeDasharray="4 4"
          />
        ))}
        {fill && <path d={area} fill={`url(#g-${id})`} />}
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2.2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pts.length > 0 && (
          <circle
            cx={pts[pts.length - 1][0]}
            cy={pts[pts.length - 1][1]}
            r={4}
            fill={color}
            stroke="#060b16"
            strokeWidth={2}
          />
        )}
      </svg>
    </div>
  );
}
