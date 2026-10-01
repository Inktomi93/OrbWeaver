import { fileURLToPath } from "node:url";
import { gate } from "../../../../tooling/src/verify/gates/no-raw-history-writes.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { assertArmVerdict, openRealCorpusLiveness } from "../../../support/real-corpus-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { CLIENT_ARMS } from "./_liveness/client.ts";

test("history mutation captures and the router alternatives keep their declared verdicts", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("the canonical client liveness arm refuses a newly authored raw history write", () => {
  const arm = CLIENT_ARMS.find((candidate) => candidate.policy.id === gate.id);
  if (arm === undefined) {
    throw new Error("the client liveness manifest has no history mutation arm");
  }
  const runner = openRealCorpusLiveness(fileURLToPath(new URL("../../../../", import.meta.url)), [arm]);
  runner.assertBaseline();
  expect(assertArmVerdict(arm, runner.verdict(arm))).toHaveLength(1);
}, 120_000);
