/**
 * Pure mappers for the `/api/integrations/*` contract that OpenRussiaRouter
 * consumes (the 9Router admin API shape). No DB, no network, no Next primitives —
 * so the pieces with real decisions behind them stay unit-testable.
 */

import { timingSafeCompare } from "@/shared/utils/timingSafeCompare";

/**
 * Ownership marker written into `api_keys.machine_id` for keys ORR pushed
 * (or adopted). Everything else on the node is operator-owned and must never be
 * deleted by a bulk sync. `api_keys` has no `source`/`managed_by` column and
 * adding one would conflict on every upstream merge, so the existing column does
 * the job.
 */
export const ORR_MACHINE_ID = "orr-node";

/** Value ORR filters on when it previews deletions (`managed_by == "service"`). */
const ORR_MANAGED_BY = "service";
const OPERATOR_MANAGED_BY = "manual";

/**
 * The one destructive decision in the contract: a bulk sync may delete ONLY keys
 * this surface owns. Operator keys are never removed by an incoming list.
 */
export function shouldDeleteOnSync(
  key: OrrIntegrationKey | null,
  incoming: ReadonlySet<string> | ReadonlyMap<string, unknown>
): boolean {
  return key !== null && key.managedBy === ORR_MANAGED_BY && !incoming.has(key.id);
}

export interface OrrIntegrationKey {
  /** Raw `sk-or-*` key — ORR matches `dbKey.RawKey` against this. */
  id: string;
  name: string;
  keyPreview: string;
  machineId: string;
  isActive: boolean;
  managedBy: string;
  createdAt: string;
}

export interface IntegrationKeyRow {
  key?: unknown;
  name?: unknown;
  isActive?: unknown;
  machineId?: unknown;
  createdAt?: unknown;
  revokedAt?: unknown;
}

export function mapIntegrationKey(row: IntegrationKeyRow): OrrIntegrationKey | null {
  const rawKey = typeof row.key === "string" ? row.key : "";
  if (!rawKey) return null;
  const machineId = typeof row.machineId === "string" ? row.machineId : "";
  return {
    id: rawKey,
    name: typeof row.name === "string" ? row.name : "",
    keyPreview: rawKey.slice(0, 8) + "****" + rawKey.slice(-4),
    machineId,
    isActive: row.isActive === true && !row.revokedAt,
    managedBy: machineId === ORR_MACHINE_ID ? ORR_MANAGED_BY : OPERATOR_MANAGED_BY,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
  };
}

/** Locate a stored key by its plaintext value (constant-time, row order preserved). */
export function findKeyRowByRawKey<T extends IntegrationKeyRow>(
  rows: readonly T[],
  rawKey: string
): T | null {
  for (const row of rows) {
    if (typeof row.key === "string" && timingSafeCompare(row.key, rawKey)) return row;
  }
  return null;
}

/**
 * Effective reasoning levels for a combo alias.
 *
 * ORR forbids unioning fallback levels and treats the node as the authority: the
 * list must be identical across every fallback model, otherwise the combo exposes
 * no public levels at all (fail-closed). A combo with no resolvable members is
 * empty for the same reason.
 */
export function resolveComboEfforts(memberEfforts: readonly (readonly string[])[]): string[] {
  const first = memberEfforts[0];
  if (!first || first.length === 0) return [];
  const signature = [...first].sort().join("\u0000");
  for (const list of memberEfforts) {
    if (list.length !== first.length) return [];
    if ([...list].sort().join("\u0000") !== signature) return [];
  }
  return [...first];
}
