import { createErrorResponse } from "@/lib/api/errorResponse";
import { getApiKeys, updateApiKeyPermissions } from "@/lib/db/apiKeys";
import {
  findKeyRowByRawKey,
  mapIntegrationKey,
  type IntegrationKeyRow,
} from "@/lib/integrations/orrContracts";
import { requireOrrNodeToken } from "@/lib/integrations/orrNodeToken";

/**
 * PATCH /api/integrations/keys/{id}/status — `{id}` is the raw key.
 * ORR expects the updated key object in the response body.
 */
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = requireOrrNodeToken(request);
  if (authError) return authError;

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse({ status: 400, message: "Invalid JSON body" });
  }

  const isActive = (body as { isActive?: unknown } | null)?.isActive;
  if (typeof isActive !== "boolean") {
    return createErrorResponse({ status: 400, message: "isActive must be a boolean" });
  }

  const rows = (await getApiKeys()) as unknown as IntegrationKeyRow[];
  const row = findKeyRowByRawKey(rows, id);
  if (!row) return createErrorResponse({ status: 404, message: "Key not found" });

  const storedId = (row as { id?: unknown }).id;
  if (typeof storedId === "string") await updateApiKeyPermissions(storedId, { isActive });

  return Response.json(mapIntegrationKey({ ...row, isActive }));
}
