import { exportCsv } from "@/lib/sentinel/store";

/** GET /api/readings/export[?unit_id=HVAC-01] — all stored readings as a CSV download. */
export async function GET(request: Request) {
  const unitId = new URL(request.url).searchParams.get("unit_id") ?? undefined;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return new Response(exportCsv(unitId), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="sentinel-readings-${unitId ?? "all"}-${stamp}.csv"`,
    },
  });
}
