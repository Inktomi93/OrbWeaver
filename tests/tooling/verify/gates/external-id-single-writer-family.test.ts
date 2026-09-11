import { gate as externalIdSingleWriter } from "../../../../tooling/src/verify/gates/external-id-single-writer.ts";
import { gate as externalIdSingleWriterHealth } from "../../../../tooling/src/verify/gates/external-id-single-writer-health.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the U1 externalId bind-once chokepoint and its carve-out health tripwire both self-prove", () => {
  expect(verifyPolicyProofs([externalIdSingleWriter, externalIdSingleWriterHealth])).toEqual([]);
});
