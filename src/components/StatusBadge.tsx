import { STATUS_META, type HvacStatus } from "@/data/sentinel";
import { cn } from "@/lib/utils";

export default function StatusBadge({
  status,
  label,
  size = "md",
}: {
  status: HvacStatus;
  label: string;
  size?: "sm" | "md";
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 font-semibold",
        size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
        meta.text
      )}
    >
      <span className="relative flex h-2 w-2">
        <span
          className={cn(
            "sentinel-ping absolute inline-flex h-full w-full rounded-full",
            meta.color
          )}
        />
        <span
          className={cn("relative inline-flex h-2 w-2 rounded-full", meta.color)}
        />
      </span>
      {label}
    </span>
  );
}
