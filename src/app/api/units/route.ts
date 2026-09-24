import { checkIngestKey } from "@/lib/sentinel/api-auth";
import { listUnits, upsertUnit } from "@/lib/sentinel/store";
import type { DeviceInfo } from "@/lib/sentinel/types";

/** GET /api/units — every unit seen so far, with optional device info and `last_seen`. */
export async function GET(request: Request) {
  void request; // reading the request keeps this handler dynamic (never prerendered)
  return Response.json(listUnits());
}

/**
 * POST /api/units — a device registers or updates its info (e.g. on boot):
 * { unit_id, chip?, ram_used_kb?, ram_total_kb?, flash_used_kb?, flash_total_kb? }
 */
export async function POST(request: Request) {
  const denied = checkIngestKey(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (typeof body?.unit_id !== "string" || !body.unit_id.trim()) {
    return Response.json({ error: "unit_id: required string" }, { status: 400 });
  }
  const info: DeviceInfo = { unit_id: body.unit_id.trim() };
  if (typeof body.chip === "string") info.chip = body.chip.slice(0, 64);
  for (const k of ["ram_used_kb", "ram_total_kb", "flash_used_kb", "flash_total_kb"] as const) {
    const v = body[k];
    if (v == null) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) return Response.json({ error: `${k}: must be a number` }, { status: 400 });
    info[k] = v;
  }
  upsertUnit(info);
  return Response.json(info, { status: 201 });
}
