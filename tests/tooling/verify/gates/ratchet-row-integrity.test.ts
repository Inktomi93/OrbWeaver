// The authored-path door deliberately resolves absolute selectors, but ratchet citations have always
// required repository-relative identity. This pin drives the final policy through its production resource
// binding with an absolute path that exists inside the fixture root: existence alone must not license it.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/ratchet-row-integrity.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function plant(root: string, path: string, text: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, text);
}

test("an absolute cite is stale even when it names an existing file inside the repository root", ({ scratch }) => {
  const cited = join(scratch, "docs/ruling.md");
  plant(scratch, "docs/ruling.md", "ruling\n");
  plant(
    scratch,
    "tooling/src/verify/gates/__probe.baseline.json",
    `${JSON.stringify({ "subject::a": { count: 1, ratified: 1, why: "ruled", cite: [cited] } }, null, 2)}\n`,
  );

  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: scratch,
    project: new Project({ skipAddingFilesFromTsConfig: true }),
    reviewedGrants: [],
    failOnWarnings: false,
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: "ratchet-row-integrity", token: "subject::a" }]);
  expect(result.authority.effectiveFindings[0]?.message).toContain("STALE WHY");
});
