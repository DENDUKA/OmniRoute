import { opaqueTokenFingerprint } from "@omniroute/open-sse/utils/opaqueTokenFingerprint.ts";

import { getDbInstance } from "@/lib/db/core";
import { ApiKeyImportConflictError, importApiKey } from "@/lib/db/apiKeyImport";

import { ORR_MACHINE_ID } from "./orrContracts";

/**
 * Ownership hand-over for a key that already exists on the node.
 *
 * `importApiKey` refuses to insert when the same plaintext is already stored
 * (under any owner) — that is the kRouter incident's shape, where a UNIQUE
 * constraint aborted the whole bulk sync and left the node without a single
 * service key. Adoption resolves the same situation by simply marking the
 * existing row as ORR-managed instead of inserting a duplicate.
 */
export function adoptApiKey(rawKey: string): boolean {
  const db = getDbInstance();
  const result = db
    .prepare(
      "UPDATE api_keys SET machine_id = ? WHERE key_hash = ? AND COALESCE(machine_id, '') <> ?"
    )
    .run(ORR_MACHINE_ID, opaqueTokenFingerprint(rawKey), ORR_MACHINE_ID);
  return Number(result.changes) > 0;
}

/**
 * Insert ORR's key, or adopt the identical plaintext that is already present.
 *
 * Returns `null` when the key could not be created or adopted, so the caller
 * reports it as missing instead of claiming a success that would leave ORR
 * believing the node serves traffic for that key.
 */
export function importOrAdoptOrrKey(name: string, key: string): string | null {
  try {
    // machine_id IS the ownership marker here: mapIntegrationKey reports
    // "service" only for this value, and only "service" rows are ever deleted
    // by a bulk sync. The host machine id would mark the key operator-owned.
    const { id } = importApiKey({ name, key }, ORR_MACHINE_ID);
    return id;
  } catch (error) {
    if (error instanceof ApiKeyImportConflictError) {
      return adoptApiKey(key) ? key : null;
    }
    throw error;
  }
}
