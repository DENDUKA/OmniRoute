import { deleteApiKey, getApiKeys } from "@/lib/db/apiKeys";
import { findKeyRowByRawKey, type IntegrationKeyRow } from "@/lib/integrations/orrContracts";
import { requireOrrNodeToken } from "@/lib/integrations/orrNodeToken";

/**
 * DELETE /api/integrations/keys/{id} — `{id}` is the raw key ORR was handed back.
 */
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = requireOrrNodeToken(request);
  if (authError) return authError;

  const { id } = await context.params;
  const rows = (await getApiKeys()) as unknown as IntegrationKeyRow[];
  const row = findKeyRowByRawKey(rows, id);
  if (!row) return Response.json({ deleted: false, id });

  const storedId = (row as { id?: unknown }).id;
  if (typeof storedId === "string") await deleteApiKey(storedId);

  return Response.json({ deleted: true, id });
}
