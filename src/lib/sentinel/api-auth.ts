// Optional shared-secret check for device writes. When SENTINEL_INGEST_KEY is set,
// POST/DELETE requests must send it in the `x-api-key` header; when unset, writes are open
// (fine on a local hackathon network, not on the public internet).

export function checkIngestKey(request: Request): Response | null {
  const expected = process.env.SENTINEL_INGEST_KEY;
  if (!expected) return null;
  if (request.headers.get("x-api-key") === expected) return null;
  return Response.json({ error: "Missing or invalid x-api-key header" }, { status: 401 });
}
