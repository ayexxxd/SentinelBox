import { checkIngestKey } from "@/lib/sentinel/api-auth";
import { addReadings, clearStore, queryReadings, validateReading } from "@/lib/sentinel/store";
import type { StoredReading } from "@/lib/sentinel/store";

const MAX_BATCH = 500;

/**
 * POST /api/readings — a SentinelBox device sends one reading (object) or a batch (array).
 * Body fields follow the README data schema; only `unit_id` is required.
 * Responds 201 { accepted } or 400 { error }.
 */
export async function POST(request: Request) {
  const denied = checkIngestKey(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const items = Array.isArray(body) ? body : [body];
  if (items.length === 0) return Response.json({ error: "No readings" }, { status: 400 });
  if (items.length > MAX_BATCH) return Response.json({ error: `At most ${MAX_BATCH} readings per request` }, { status: 413 });

  const readings: StoredReading[] = [];
  for (let i = 0; i < items.length; i++) {
    const v = validateReading(items[i], i);
    if (!v.ok) return Response.json({ error: v.error }, { status: 400 });
    readings.push(v.reading);
  }
  addReadings(readings);
  return Response.json({ accepted: readings.length }, { status: 201 });
}

/**
 * GET /api/readings?since=<ISO|epoch ms>&unit_id=<id>&limit=<n>
 * Returns readings ascending by timestamp. This is what the dashboard polls.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const sinceRaw = params.get("since");
  const since = sinceRaw ? (/^\d+$/.test(sinceRaw) ? Number(sinceRaw) : Date.parse(sinceRaw)) : undefined;
  if (since !== undefined && !Number.isFinite(since)) {
    return Response.json({ error: "since must be ISO 8601 or epoch ms" }, { status: 400 });
  }
  const limitRaw = params.get("limit");
  const limit = limitRaw ? Math.max(1, Math.min(50_000, Number(limitRaw) || 0)) : undefined;
  return Response.json(queryReadings({ since, unitId: params.get("unit_id") ?? undefined, limit }));
}

/** DELETE /api/readings — clears all stored readings and units (for resetting a demo). */
export async function DELETE(request: Request) {
  const denied = checkIngestKey(request);
  if (denied) return denied;
  clearStore();
  return new Response(null, { status: 204 });
}
