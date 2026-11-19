import { updateProviderConnection } from "@/lib/db/providers";
import { createErrorResponse } from "@/lib/api/errorResponse";
import { requireOrrNodeToken } from "@/lib/integrations/orrNodeToken";
import { connectionSummary, type OrrConnectionRow } from "@/lib/integrations/orrConnection";

/**
 * PATCH /api/integrations/providers/{connectionId}/status
 *
 * Enables/disables a provider connection from ORR's admin panel. Body: `{ isActive }`.
 */
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  const authError = requireOrrNodeToken(request);
  if (authError) return authError;

  const { connectionId } = await context.params;
  if (!connectionId) {
    return createErrorResponse({ status: 400, message: "connectionId is required" });
  }

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

  const updated = (await updateProviderConnection(connectionId, {
    isActive,
  })) as unknown as OrrConnectionRow | null;

  if (!updated) {
    return createErrorResponse({ status: 404, message: "Connection not found" });
  }

  return Response.json({ connection: connectionSummary(updated) });
}
