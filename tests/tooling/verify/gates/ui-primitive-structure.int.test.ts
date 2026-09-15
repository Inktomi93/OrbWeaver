import { gate as health } from "../../../../tooling/src/verify/gates/ui-primitive-overlay-health.ts";
import { gate as permissions } from "../../../../tooling/src/verify/gates/ui-primitive-permissions.ts";
import { gate as ordinary } from "../../../../tooling/src/verify/gates/ui-primitive-structure.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const POLICIES = [ordinary, permissions, health] as const;

test("final UI primitive authority owners execute their declared proofs", () => {
  expect(verifyPolicyProofs(POLICIES)).toEqual([]);
});
