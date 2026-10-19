// The policy that judges "the ledger killed this contract shape by name" (tooling/src/verify/lib/ledger-banned-shapes.ts).
// The D12 `@orb/contracts/sessions` import ban is biome's native noRestrictedImports, pinned by ../lib/ledger-banned-shapes.int.test.ts;
// the schema partition is tests/db/schema/table-integrity.suite.test.ts.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate as contractBannedShapes } from "../../../../tooling/src/verify/gates/contract-banned-shapes.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("the ledger's rejected contract shapes keep their two-sided proofs", () => {
  expect(verifyPolicyProofs([contractBannedShapes])).toEqual([]);
});
