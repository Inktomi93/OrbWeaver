import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { GatePolicy, GatePolicyProof } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate } from "../../../../tooling/src/verify/gates/test-assembly-home.ts";
import { gate as clones } from "../../../../tooling/src/verify/gates/test-production-clone.ts";
import { gate as reach } from "../../../../tooling/src/verify/gates/test-reach.ts";
import { gate as rawDoors } from "../../../../tooling/src/verify/gates/tests-raw-package-reach.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("canonical assembly ownership and retained clone cases hold on bounded virtual sources", () => {
  expect(verifyPolicyProofs([gate, clones])).toEqual([]);
});

test("composed reach declared controls credit exercised subjects rather than incidental imports", () => {
  const subject = "tests/server/domain/chat/composed.int.test.ts";
  const composedFlags = reach.mustFlag.filter((proof: GatePolicyProof) => proof.files[subject] !== undefined);
  const composedPasses = reach.mustPass.filter((proof: GatePolicyProof) => proof.files[subject] !== undefined);
  const { mustRefuse: _unselectedRefusals, ...decision } = reach;
  const bounded = defineGate({ ...decision, mustFlag: composedFlags, mustPass: composedPasses });
  expect(verifyPolicyProofs([bounded])).toEqual([]);
});

test("existing public testkit and package door controls retain both admitted and forbidden routes", () => {
  expect(verifyPolicyProofs([rawDoors])).toEqual([]);
});

function actualServiceCase(repoRoot: string, owner: string, factory: string): GatePolicy {
  const service = `packages/server/src/domain/${owner}/service.ts`;
  const contract = `packages/server/src/domain/${owner}/contract/service.ts`;
  const caller = `tests/server/domain/${owner}/alternate.int.test.ts`;
  const files = {
    [service]: readFileSync(join(repoRoot, service), "utf8"),
    [contract]: readFileSync(join(repoRoot, contract), "utf8"),
    [`packages/server/src/domain/${owner}/index.ts`]: `export { ${factory} } from './service.ts';`,
    [caller]: `import { ${factory} } from '../../../../packages/server/src/domain/${owner}/index.ts'; declare const args: Parameters<typeof ${factory}>; export const alternate = ${factory}(...args);`,
  };
  const { mustRefuse: _unselectedRefusals, ...decision } = gate;
  return defineGate({
    ...decision,
    mustFlag: [
      {
        mode: "types",
        files,
        expect: { count: 1, messageIncludes: "canonical service factory" },
        why: `the actual ${owner} constructor cannot build a second test graph`,
      },
    ],
    mustPass: [{ mode: "types", files: { [caller]: "export {};" }, why: "an empty test constructs no graph" }],
  });
}

test("the actual wrapped chat constructor is refused through its canonical public barrel", ({ repoRoot }) => {
  expect(verifyPolicyProofs([actualServiceCase(repoRoot, "chat", "createChatService")])).toEqual([]);
});

test("the actual direct notifications constructor remains the matching governed positive", ({ repoRoot }) => {
  expect(verifyPolicyProofs([actualServiceCase(repoRoot, "notifications", "createNotificationsService")])).toEqual([]);
});

test("wrapped assembly classification preserves its declared owner and contract near misses", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});
