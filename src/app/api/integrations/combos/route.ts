import { getComboStepTarget } from "@/lib/combos/steps";
import { getCombos } from "@/lib/db/combos";
import { requireOrrNodeToken } from "@/lib/integrations/orrNodeToken";

/**
 * GET /api/integrations/combos
 *
 * Combo aliases as routable model ids. ORR adds each one to the node catalog with
 * the highest rank, so a combo name sold in billing resolves to this node even
 * when no provider model shares that id.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = requireOrrNodeToken(request);
  if (authError) return authError;

  const combos = await getCombos();

  return Response.json({
    combos: combos.flatMap((combo) => {
      const name = typeof combo.name === "string" ? combo.name.trim() : "";
      if (!name) return [];
      return [
        {
          id: typeof combo.id === "string" ? combo.id : name,
          name,
          kind: null,
          models: (Array.isArray(combo.models) ? combo.models : [])
            .map((step) => getComboStepTarget(step))
            .filter((target): target is string => !!target),
        },
      ];
    }),
  });
}
