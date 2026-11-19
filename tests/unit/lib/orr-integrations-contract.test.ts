import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ORR_MACHINE_ID,
  findKeyRowByRawKey,
  mapIntegrationKey,
  resolveComboEfforts,
  shouldDeleteOnSync,
} from "../../../src/lib/integrations/orrContracts.ts";
import { requireOrrNodeToken } from "../../../src/lib/integrations/orrNodeToken.ts";

const RAW = "sk-or-v1-0123456789abcdef0123456789abcdef";

test("mapIntegrationKey exposes the raw key as id (ORR matches RawKey against it)", () => {
  const key = mapIntegrationKey({
    key: RAW,
    name: "1",
    isActive: true,
    machineId: ORR_MACHINE_ID,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(key?.id, RAW);
  assert.equal(key?.managedBy, "service");
  assert.equal(key?.isActive, true);
  assert.equal(key?.keyPreview.includes("****"), true);
  assert.equal(key?.keyPreview.includes(RAW.slice(8, -4)), false, "preview must not carry the middle");
});

test("mapIntegrationKey reports operator keys as manual so sync leaves them alone", () => {
  const key = mapIntegrationKey({ key: RAW, machineId: "f6be45662dcd76eb" });
  assert.equal(key?.managedBy, "manual");
});

test("mapIntegrationKey treats a revoked key as inactive", () => {
  const key = mapIntegrationKey({
    key: RAW,
    isActive: true,
    revokedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(key?.isActive, false);
});

test("mapIntegrationKey drops rows without a plaintext key", () => {
  assert.equal(mapIntegrationKey({ name: "nameless" }), null);
});

test("shouldDeleteOnSync deletes only ORR-owned keys missing from the incoming list", () => {
  const owned = mapIntegrationKey({ key: RAW, machineId: ORR_MACHINE_ID });
  const operator = mapIntegrationKey({ key: RAW, machineId: "operator-host" });

  assert.equal(shouldDeleteOnSync(owned, new Set()), true);
  assert.equal(shouldDeleteOnSync(owned, new Set([RAW])), false);
  assert.equal(shouldDeleteOnSync(operator, new Set()), false, "operator key must survive any sync");
  assert.equal(shouldDeleteOnSync(null, new Set()), false);
});

test("findKeyRowByRawKey matches by plaintext value, not by prefix", () => {
  const rows = [{ key: RAW }, { key: `${RAW}-other` }];
  assert.equal(findKeyRowByRawKey(rows, RAW), rows[0]);
  assert.equal(findKeyRowByRawKey(rows, RAW.slice(0, -1)), null);
});

test("resolveComboEfforts keeps identical member lists", () => {
  assert.deepEqual(
    resolveComboEfforts([
      ["none", "low"],
      ["low", "none"],
    ]),
    ["none", "low"]
  );
});

test("resolveComboEfforts fails closed when fallback levels differ", () => {
  assert.deepEqual(resolveComboEfforts([["none", "thinking"], ["none", "low"]]), []);
  assert.deepEqual(resolveComboEfforts([["none", "thinking"], ["none"]]), []);
  assert.deepEqual(resolveComboEfforts([["low", "medium"], ["low"]]), []);
});

test("resolveComboEfforts is empty for a combo without resolvable levels", () => {
  assert.deepEqual(resolveComboEfforts([]), []);
  assert.deepEqual(resolveComboEfforts([[]]), []);
});

test("requireOrrNodeToken fails closed when the node token is unconfigured", async () => {
  delete process.env.ORR_NODE_TOKEN;
  const response = requireOrrNodeToken(new Request("http://localhost/api/integrations/providers"));
  assert.equal(response?.status, 503);
});

test("requireOrrNodeToken accepts bearer or x-orr-node-token and rejects anything else", () => {
  process.env.ORR_NODE_TOKEN = "rct_test_token";

  const bearer = new Request("http://localhost/api/integrations/providers", {
    headers: { authorization: "Bearer rct_test_token" },
  });
  assert.equal(requireOrrNodeToken(bearer), null);

  const header = new Request("http://localhost/api/integrations/providers", {
    headers: { "x-orr-node-token": "rct_test_token" },
  });
  assert.equal(requireOrrNodeToken(header), null);

  const wrong = new Request("http://localhost/api/integrations/providers", {
    headers: { authorization: "Bearer rct_test_tokeX" },
  });
  assert.equal(requireOrrNodeToken(wrong)?.status, 401);

  const missing = new Request("http://localhost/api/integrations/providers");
  assert.equal(requireOrrNodeToken(missing)?.status, 401);

  delete process.env.ORR_NODE_TOKEN;
});
