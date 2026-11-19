import { createErrorResponse } from "@/lib/api/errorResponse";
import { getApiKeys } from "@/lib/db/apiKeys";
import { findKeyRowByRawKey, mapIntegrationKey, type IntegrationKeyRow } from "@/lib/integrations/orrContracts";
import { adoptApiKey, importOrAdoptOrrKey } from "@/lib/integrations/orrKeyStore";
import { requireOrrNodeToken } from "@/lib/integrations/orrNodeToken";

/**
 * GET/POST /api/integrations/keys
 *
 * `id` is the RAW `sk-or-*` value, not an internal uuid: ORR matches its own
 * `RawKey` against this field (see `CheckNodeIntegrationKeysSync`) and reuses it
 * in `/keys/{id}` requests. The stored uuid never leaves the node.
 */
export const dynamic = "force-dynamic";

const ORR_KEY_SHAPE = /^sk-[A-Za-z0-9_-]+$/;

export async function GET(request: Request) {
  const authError = requireOrrNodeToken(request);
  if (authError) return authError;

  const rows = (await getApiKeys()) as unknown as IntegrationKeyRow[];
  return Response.json({
    keys: rows.map(mapIntegrationKey).filter((key) => key !== null),
  });
}

export async function POST(request: Request) {
  const authError = requireOrrNodeToken(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse({ status: 400, message: "Invalid JSON body" });
  }

  const name = (body as { name?: unknown } | null)?.name;
  const key = (body as { key?: unknown } | null)?.key;
  if (typeof name !== "string" || !name.trim() || typeof key !== "string" || !ORR_KEY_SHAPE.test(key)) {
    return createErrorResponse({ status: 400, message: "name and key are required" });
  }

  const rows = (await getApiKeys()) as unknown as IntegrationKeyRow[];
  if (findKeyRowByRawKey(rows, key)) {
    // Retried push of a key the node already stores (possibly operator-owned).
    adoptApiKey(key);
    return Response.json({ created: true, id: key });
  }

  const created = await importOrAdoptOrrKey(name.trim(), key);
  if (!created) {
    return createErrorResponse({ status: 409, message: "Key could not be imported" });
  }

  return Response.json({ created: true, id: key });
}
