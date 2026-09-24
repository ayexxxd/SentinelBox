import { checkIngestKey } from "@/lib/sentinel/api-auth";
import { seed, start, status, stop } from "@/lib/sentinel/sim-server";
import { stats } from "@/lib/sentinel/store";

/** GET /api/simulate — simulator status plus database totals. */
export async function GET(request: Request) {
  void request; // keep this handler dynamic
  return Response.json({ simulator: status(), database: stats() });
}

/**
 * POST /api/simulate
 *   { "action": "seed", "minutes": 25, "reset": true }  backfill history into the DB
 *   { "action": "start" }                                 stream live readings every 2 s
 *   { "action": "stop" }
 */
export async function POST(request: Request) {
  const denied = checkIngestKey(request);
  if (denied) return denied;

  let body: { action?: string; minutes?: number; reset?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  switch (body.action) {
    case "seed": {
      const minutes = Number(body.minutes ?? 25);
      if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 24 * 60) {
        return Response.json({ error: "minutes: 1–1440" }, { status: 400 });
      }
      const written = seed(minutes, body.reset !== false);
      return Response.json({ seeded: written, simulator: status() }, { status: 201 });
    }
    case "start":
      return Response.json({ started: start(), simulator: status() });
    case "stop":
      return Response.json({ stopped: stop(), simulator: status() });
    default:
      return Response.json({ error: 'action must be "seed", "start" or "stop"' }, { status: 400 });
  }
}
