import { createErrorResponse } from "@/lib/api/errorResponse";
import { timingSafeCompare } from "@/shared/utils/timingSafeCompare";

/**
 * Node-token auth for the OpenRussiaRouter integration surface.
 *
 * ORR authenticates to a node with a control token of its own, not with an
 * OmniRoute API key: it sends `Authorization: Bearer <token>` and duplicates the
 * same value in `X-ORR-Node-Token` (health probes send only the header). The
 * token lives in `ORR_NODE_TOKEN` and every `/api/integrations/*` handler
 * enforces it itself, exactly like the 9Router contract this replaces.
 *
 * These routes are registered in PUBLIC_API_ROUTE_PREFIXES so the central
 * dashboard/management policy does not reject the request before the handler
 * runs (the same pattern `/api/skills/collect/chaos` uses). That makes THIS
 * function the only gate — never drop it from a handler.
 */
export const ORR_NODE_TOKEN_HEADER = "x-orr-node-token";

export function requireOrrNodeToken(request: Request): Response | null {
  const expected = process.env.ORR_NODE_TOKEN?.trim();
  if (!expected) {
    return createErrorResponse({
      status: 503,
      message: "ORR_NODE_TOKEN is not configured",
      type: "server_error",
    });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const bearer = /^bearer\s+/i.test(authorization)
    ? authorization.replace(/^bearer\s+/i, "").trim()
    : "";
  const candidate = bearer || (request.headers.get(ORR_NODE_TOKEN_HEADER) ?? "").trim();

  if (candidate && timingSafeCompare(candidate, expected)) return null;

  return createErrorResponse({
    status: 401,
    message: "Invalid node token",
    type: "invalid_request",
  });
}
