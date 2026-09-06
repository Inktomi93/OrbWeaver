// The two policies that judge "the ledger killed this shape by name". They share one vocabulary
// (tooling/src/verify/lib/ledger-banned-shapes.ts) and split by EVIDENCE PLANE: the Drizzle schema fact vs
// authored contract declarations. The third arm of the old single gate — the D12 `@orb/contracts/sessions`
// import ban — is biome's native noRestrictedImports now, pinned by ../lib/ledger-banned-shapes.int.test.ts.
import { expect, test } from "vitest";
import { gate as contractBannedShapes } from "../../../../tooling/src/verify/gates/contract-banned-shapes.ts";
import { gate as schemaBannedShapes } from "../../../../tooling/src/verify/gates/schema-banned-shapes.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("the ledger's rejected schema and contract shapes keep their two-sided proofs", () => {
  expect(verifyPolicyProofs([schemaBannedShapes, contractBannedShapes])).toEqual([]);
});
