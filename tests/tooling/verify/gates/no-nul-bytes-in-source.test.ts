import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/no-nul-bytes-in-source.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("preserves raw-byte occurrences, source fences and unavailable-tree refusal through production dispatch", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

// The staged-commit door: only the requested files are judged, so a NUL a sibling left behind is not re-blamed.
test("a staged request judges the requested files' NUL bytes and not an untouched sibling's", ({ scratch }) => {
  const overlay = {
    "packages/anchor.txt": "clean",
    "tooling/anchor.txt": "clean",
    "tests/anchor.txt": "clean",
    "scripts/anchor.txt": "clean",
    "docs/anchor.txt": "clean",
    "docs/staged.md": "bad\u0000byte\n",
    "docs/untouched.md": "bad\u0000byte\n",
  };
  const staged = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: scratch,
    project: new Project({ skipAddingFilesFromTsConfig: true }),
    resourceOptions: { overlay },
    reviewedGrants: [],
    failOnWarnings: false,
    requestedPaths: ["docs/staged.md"],
  });

  expect(staged.toolErrors).toEqual([]);
  expect(staged.authority.effectiveFindings).toMatchObject([{ policyId: "no-nul-bytes-in-source", file: "docs/staged.md" }]);
  expect(staged.authority.effectiveFindings).toHaveLength(1);
});
