import { fileURLToPath } from "node:url";
import { gate } from "../../../../tooling/src/verify/gates/no-raw-history-writes.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import type { RealCorpusLivenessArm } from "../../../support/real-corpus-liveness.ts";
import { assertArmVerdict, openRealCorpusLiveness } from "../../../support/real-corpus-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("history mutation captures and the router alternatives keep their declared verdicts", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("the real client population refuses a newly authored raw history write", () => {
  const arm: RealCorpusLivenessArm = {
    policy: gate,
    messageIncludes: "browser History mutation directly",
    overlays: [{ kind: "add" as const, path: "packages/client/src/lib/router-history-liveness.ts", source: 'globalThis.history.replaceState(null, "", "/");' }],
  };
  const runner = openRealCorpusLiveness(fileURLToPath(new URL("../../../../", import.meta.url)), [arm]);
  runner.assertBaseline();
  expect(assertArmVerdict(arm, runner.verdict(arm))).toHaveLength(1);
}, 120_000);
