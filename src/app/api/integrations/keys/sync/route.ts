import { createErrorResponse } from "@/lib/api/errorResponse";
import { deleteApiKey, getApiKeys, updateApiKeyPermissions } from "@/lib/db/apiKeys";
import {
  findKeyRowByRawKey,
  mapIntegrationKey,
  shouldDeleteOnSync,
  type IntegrationKeyRow,
} from "@/lib/integrations/orrContracts";
import { adoptApiKey, importOrAdoptOrrKey } from "@/lib/integrations/orrKeyStore";
import { requireOrrNodeToken } from "@/lib/integrations/orrNodeToken";

/**
 * POST /api/integrations/keys/sync — idempotent bulk reconciliation.
 *
 * ORR sends every non-deleted key it owns. Deletion is restricted to rows this
 * surface owns (`machine_id === ORR_MACHINE_ID`): operator-created keys are never
 * touched, and an identical plaintext already present as an operator row is
 * adopted instead of inserted — the kRouter failure mode, where a duplicate
 * aborted the whole sync and left the node answering 401 to all traffic.
 *
 * An empty list therefore deletes every ORR-owned key, which is the intended
 * meaning ("ORR has no keys left"). ORR does not send an empty list when
 * AuthService is unreachable — it skips the sweep instead.
 */
export const dynamic = "force-dynamic";

const ORR_KEY_SHAPE = /^sk-[A-Za-z0-9_-]+$/;

export async function POST(request: Request) {
  const authError = requireOrrNodeToken(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse({ status: 400, message: "Invalid JSON body" });
  }

  const entries = (body as { keys?: unknown } | null)?.keys;
  if (!Array.isArray(entries)) {
    return createErrorResponse({ status: 400, message: "keys must be an array" });
  }

  const incoming = new Map<string, { name: string; isActive: boolean }>();
  for (const entry of entries as Array<Record<string, unknown>>) {
    const key = entry?.key;
    if (typeof key !== "string" || !ORR_KEY_SHAPE.test(key)) continue;
    incoming.set(key, {
      name: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : key.slice(0, 8),
      isActive: entry.isActive !== false,
    });
  }

  const rows = (await getApiKeys()) as unknown as IntegrationKeyRow[];
  let addedCount = 0;
  let disabledCount = 0;
  let reactivatedCount = 0;
  let deletedCount = 0;

  for (const [key, entry] of incoming) {
    const row = findKeyRowByRawKey(rows, key);
    const current = row ? mapIntegrationKey(row) : null;

    if (!row || !current) {
      if (importOrAdoptOrrKey(entry.name, key)) addedCount += 1;
      continue;
    }

    if (current.managedBy !== "service") {
      // Present as an operator row: hand ownership over instead of failing the insert.
      adoptApiKey(key);
      addedCount += 1;
      continue;
    }

    if (current.isActive === entry.isActive) continue;

    const storedId = (row as { id?: unknown }).id;
    if (typeof storedId !== "string") continue;
    await updateApiKeyPermissions(storedId, { isActive: entry.isActive });
    if (entry.isActive) reactivatedCount += 1;
    else disabledCount += 1;
  }

  for (const row of rows) {
    const mapped = mapIntegrationKey(row);
    if (!shouldDeleteOnSync(mapped, incoming)) continue;

    const storedId = (row as { id?: unknown }).id;
    if (typeof storedId !== "string") continue;
    await deleteApiKey(storedId);
    deletedCount += 1;
  }

  return Response.json({ addedCount, disabledCount, reactivatedCount, deletedCount });
}
