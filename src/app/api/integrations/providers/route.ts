import { getProviderConnections } from "@/lib/db/providers";
import { requireOrrNodeToken } from "@/lib/integrations/orrNodeToken";
import { connectionSummary, type OrrConnectionRow } from "@/lib/integrations/orrConnection";

/**
 * GET /api/integrations/providers
 *
 * 9Router admin-API shape consumed by OpenRussiaRouter (`WebApp` "Check" button
 * and `RouterNodeProvider`). Only the fields ORR actually reads are emitted.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = requireOrrNodeToken(request);
  if (authError) return authError;

  const connections = (await getProviderConnections()) as unknown as OrrConnectionRow[];

  return Response.json({
    connections: connections.map(connectionSummary),
  });
}
