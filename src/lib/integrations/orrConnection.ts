import { getResolvedModelCapabilities } from "@/lib/modelCapabilities";

/** Row shape of `getProviderConnections()` — only what the integration API reads. */
export interface OrrConnectionRow {
  id: string;
  provider: string;
  authType?: string | null;
  name?: string | null;
  isActive?: boolean | null;
  testStatus?: string | null;
}

/** Connection/mode fields ORR maps into its own contract entries. */
export function connectionSummary(connection: OrrConnectionRow) {
  return {
    id: connection.id,
    provider: connection.provider,
    authType: connection.authType ?? "none",
    name: connection.name ?? null,
    isActive: connection.isActive === true,
    testStatus: connection.testStatus ?? null,
  };
}

/**
 * Public reasoning levels for one model.
 *
 * A synced tier list wins; otherwise the canonical resolver (persisted override →
 * registry → synced tiers) decides. An empty result is reported as empty — the
 * contract carries no "unknown" value and ORR treats empty as "no public levels".
 */
export function modelReasoningEfforts(
  provider: string,
  modelId: string,
  declared: readonly string[] | null | undefined
): string[] {
  if (declared && declared.length > 0) return [...declared];
  const resolved = getResolvedModelCapabilities({ provider, model: modelId });
  return resolved.supportedThinkingEfforts ? [...resolved.supportedThinkingEfforts] : [];
}

/** Same resolution for a `${provider}/${model}` target string (combo steps). */
export function targetReasoningEfforts(target: string): string[] {
  const slash = target.indexOf("/");
  const provider = slash > 0 ? target.slice(0, slash) : "";
  const model = slash > 0 ? target.slice(slash + 1) : target;
  return modelReasoningEfforts(provider, model, null);
}
