// The surviving class-token-splice controls retain ordinary waiver and call-coordinate behavior.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as classTokenSplice } from "../../../../tooling/src/verify/gates/class-token-splice.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const FAMILY: readonly GatePolicy[] = [classTokenSplice];

const CONFORMANCE_TIMEOUT_MS = scaledBudget(180_000);

const ROOT = "/class-string-literal-wave";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project: projectOf(files), reviewedGrants: [], failOnWarnings: false });
}

test(
  "the class-string wave keeps its founding, near-miss, declared-limit and fence fixtures",
  () => {
    expect(verifyPolicyProofs(FAMILY)).toEqual([]);
  },
  CONFORMANCE_TIMEOUT_MS,
);

test("an ordinary waiver at the interpolated expression this policy reports suppresses exactly one finding", () => {
  const waived = passOf(classTokenSplice, {
    "packages/ui/src/probe.tsx":
      'const side = "end";\n' +
      "// @orb-waive class-token-splice(side): the proof's stand-in reason and its end condition.\n" +
      "const x = <div className={`inset-${side}-0 p-2`} />;\n",
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

// Call expressions need the existing paren-free waiver coordinate.
test("a splice on a CALL is reported at the derived paren-free token, not at the call text", () => {
  const flagged = passOf(classTokenSplice, {
    "packages/client/src/probe.ts": "const x = cn(`text-${someRuntimeThing()}`);\n",
  });

  expect(flagged.authority.effectiveFindings).toMatchObject([{ policyId: "class-token-splice", token: "someRuntimeThing" }]);
  expect(flagged.authority.authorityAlarms).toEqual([]);
});
