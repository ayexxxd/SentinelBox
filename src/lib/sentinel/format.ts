const DASH = "—";

export function fmtNum(v: number | null | undefined, decimals = 1) {
  if (v == null || Number.isNaN(v)) return DASH;
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtPct(v: number | null | undefined, decimals = 1) {
  return v == null ? DASH : `${fmtNum(v, decimals)}%`;
}

export function fmtSigned(v: number | null | undefined, decimals = 1, suffix = "%") {
  if (v == null || Number.isNaN(v)) return DASH;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "±";
  return `${sign}${fmtNum(Math.abs(v), decimals)}${suffix}`;
}

export function fmtDuration(seconds: number | null | undefined) {
  if (seconds == null) return DASH;
  if (seconds < 60) return `${fmtNum(seconds, seconds < 10 ? 1 : 0)} s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function fmtTime(t: number, withSeconds = true) {
  return new Date(t).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  });
}
