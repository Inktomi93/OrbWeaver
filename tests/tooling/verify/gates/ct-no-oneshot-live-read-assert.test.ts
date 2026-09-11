import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/ct-no-oneshot-live-read-assert.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("a non-retrying expect() reading mutable async state in a CT is flagged, and a settled read is not", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

const ROOT = "/ct-no-oneshot-family";

function passOf(files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({ knownPolicies: [gate], policies: [gate], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
}

// ---------------------------------------------------------------------------------------------------
// REPORT IDENTITY. The gate's report supplies its own policy id and a "expect" position token — this
// proves what the mustFlag row can only assert indirectly: a marker naming the WRONG policy at the exact
// same position is not bound by the central engine, and the underlying finding survives unsuppressed.
// ---------------------------------------------------------------------------------------------------
test("an @orb-waive naming the WRONG policy at the exact position suppresses nothing", () => {
  const mismatched = passOf({
    "tests/client/data/x.ct.tsx":
      'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", () => {\n  // @orb-waive no-inline-types(expect): names a different policy than this gate.\n  expect(trpc.count("tag.createTag")).toBe(2);\n});\n',
  });

  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.effectiveFindings[0]).toMatchObject({ policyId: "ct-no-oneshot-live-read-assert" });
  expect(mismatched.authority.authorityAlarms).toMatchObject([
    { kind: "ordinary-waiver", message: expect.stringContaining("targets unknown policy no-inline-types") },
  ]);
});

test("an @orb-waive naming this gate's OWN id at the exact position suppresses the finding", () => {
  const waived = passOf({
    "tests/client/data/x.ct.tsx":
      'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", () => {\n  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — count polled to 2 above.\n  expect(trpc.count("tag.createTag")).toBe(2);\n});\n',
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});
