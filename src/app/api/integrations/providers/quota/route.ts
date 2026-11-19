import { getProviderConnections } from "@/lib/db/providers";
import { requireOrrNodeToken } from "@/lib/integrations/orrNodeToken";
import { connectionSummary, type OrrConnectionRow } from "@/lib/integrations/orrConnection";
import { getSanitizedCachedProviderLimitsMap } from "@/lib/usage/providerLimits";

/**
 * GET /api/integrations/providers/quota[?includeInactive=true]
 *
 * Feeds ORR's `orr_provider_quota*` metrics and the provider-limits admin page.
 * The cached limits entry is passed through as `usage` unchanged: it already
 * carries `quotas.<name>.{used,total,remaining,resetAt}`, the shape ORR reads.
 * A connection without a cached entry is still listed — ORR requires every
 * connection to stay visible even when it reports no numbers.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = requireOrrNodeToken(request);
  if (authError) return authError;

  const includeInactive =
    new URL(request.url).searchParams.get("includeInactive")?.toLowerCase() === "true";

  const connections = (await getProviderConnections(
    includeInactive ? {} : { isActive: true }
  )) as unknown as OrrConnectionRow[];
  const limits = await getSanitizedCachedProviderLimitsMap();

  const providers = connections.map((connection) => {
    const entry = limits[connection.id];
    return {
      ...connectionSummary(connection),
      connectionId: connection.id,
      quotaSupported: entry !== undefined,
      usage: entry ?? null,
      error: entry === undefined ? "no_cached_quota" : null,
    };
  });

  return Response.json({ providers });
}
