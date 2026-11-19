import { getComboStepTarget } from "@/lib/combos/steps";
import { getCombos } from "@/lib/db/combos";
import { getSyncedAvailableModelsByConnection, type SyncedAvailableModel } from "@/lib/db/models";
import { getProviderConnections } from "@/lib/db/providers";
import { resolveComboEfforts } from "@/lib/integrations/orrContracts";
import {
  connectionSummary,
  modelReasoningEfforts,
  targetReasoningEfforts,
  type OrrConnectionRow,
} from "@/lib/integrations/orrConnection";
import { requireOrrNodeToken } from "@/lib/integrations/orrNodeToken";
import { getModelsByProviderId } from "@/shared/constants/models";

/**
 * GET /api/integrations/providers/with-models
 *
 * Catalog the ORR CollectorService turns into capability-routing data and the
 * public reasoning catalog. Two shapes matter and both are load-bearing:
 *
 * - provider models: only active connections and `enabled` models;
 * - the synthetic `provider: "combo"` connection: every combo alias is a routable
 *   model of its own (ORR ranks it above the direct route), and its
 *   `reasoningEfforts` is computed here — ORR never re-derives it.
 *
 * Models come from the already-synced per-connection snapshot (no upstream call),
 * falling back to the static registry list for providers without discovery.
 */
export const dynamic = "force-dynamic";

interface OrrModelCandidate {
  id: string;
  name: string;
  declaredEfforts?: readonly string[];
  modelType?: string;
}

function capsFor(provider: string, modelId: string, declared?: readonly string[]) {
  const reasoningEfforts = modelReasoningEfforts(provider, modelId, declared);
  return {
    reasoning: reasoningEfforts.length > 0,
    thinkingCanDisable: true,
    thinkingOptions: [] as string[],
    reasoningEfforts,
  };
}

export async function GET(request: Request) {
  const authError = requireOrrNodeToken(request);
  if (authError) return authError;

  const connections = (await getProviderConnections({
    isActive: true,
  })) as unknown as OrrConnectionRow[];

  const syncedByProvider = new Map<string, Record<string, SyncedAvailableModel[]>>();
  const syncedFor = async (provider: string) => {
    let synced = syncedByProvider.get(provider);
    if (!synced) {
      synced = await getSyncedAvailableModelsByConnection(provider);
      syncedByProvider.set(provider, synced);
    }
    return synced;
  };

  const payload: Array<Record<string, unknown>> = [];

  for (const connection of connections) {
    const synced = (await syncedFor(connection.provider))[connection.id] ?? [];
    const candidates: OrrModelCandidate[] =
      synced.length > 0
        ? synced.map((model) => ({
            id: model.id,
            name: model.name || model.id,
            declaredEfforts: model.supportedThinkingEfforts,
            modelType: model.modelType,
          }))
        : (getModelsByProviderId(connection.provider) ?? []).map((model) => ({
            id: model.id,
            name: model.name || model.id,
          }));

    payload.push({
      ...connectionSummary(connection),
      models: candidates.map((candidate) => ({
        id: candidate.id,
        publicId: `${connection.provider}/${candidate.id}`,
        name: candidate.name,
        type: candidate.modelType && candidate.modelType !== "chat" ? candidate.modelType : "llm",
        enabled: true,
        caps: capsFor(connection.provider, candidate.id, candidate.declaredEfforts),
      })),
    });
  }

  const combos = await getCombos();
  const comboModels = combos.flatMap((combo) => {
    const name = typeof combo.name === "string" ? combo.name.trim() : "";
    if (!name) return [];
    const members = (Array.isArray(combo.models) ? combo.models : [])
      .map((step) => getComboStepTarget(step))
      .filter((target): target is string => !!target);
    const memberEfforts = members.map((member) => targetReasoningEfforts(member));
    return [
      {
        id: name,
        publicId: name,
        name,
        type: "combo",
        enabled: true,
        caps: {
          reasoning: true,
          thinkingCanDisable: true,
          thinkingOptions: [] as string[],
          reasoningEfforts: resolveComboEfforts(memberEfforts),
          comboReasoningMembers: members.map((member, index) => ({
            modelId: member,
            reasoningEfforts: memberEfforts[index],
          })),
        },
      },
    ];
  });

  if (comboModels.length > 0) {
    payload.push({
      id: "__combos__",
      provider: "combo",
      authType: "none",
      name: "Combos",
      isActive: true,
      testStatus: null,
      models: comboModels,
    });
  }

  return Response.json({ connections: payload });
}
