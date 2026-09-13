import { readFileSync } from "node:fs";
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/no-arbitrary-tw-values.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/arbitrary-value-conversion";
const SUBJECT = "packages/ui/src/layout/variants.ts";
function drive(files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], project, root: ROOT, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  return result;
}

test("preserves all legacy value predicates through production conformance", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("a former allowlisted file now owes exact per-occurrence permission", () => {
  const raw = drive({ [SUBJECT]: 'export const value = "grid-cols-[repeat(auto-fit,1fr)] w-[137px]";' });
  expect(raw.authority.effectiveFindings).toHaveLength(2);
  const waived = drive({
    [SUBJECT]:
      '// @orb-waive no-arbitrary-tw-values(grid-cols-[repeat): justified track composition; ends with this proof.\nexport const value = "grid-cols-[repeat(auto-fit,1fr)] w-[137px]";',
  });
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.effectiveFindings.map((f) => f.token)).toEqual(["w-[137px]"]);
  expect(waived.authority.authorityAlarms).toEqual([]);
  const stale = drive({
    [SUBJECT]: '// @orb-waive no-arbitrary-tw-values(grid-cols-[repeat): obsolete track composition.\nexport const value = "grid-cols-2";',
  });
  expect(stale.authority.authorityAlarms.length).toBeGreaterThan(0);
});

test("wrong positions cannot waive a value and package population remains fenced", () => {
  const wrong = drive({ [SUBJECT]: '// @orb-waive no-arbitrary-tw-values(w): deliberately wrong position.\nexport const value = "w-[137px]";' });
  expect(wrong.authority.waivedFindings).toEqual([]);
  expect(wrong.authority.effectiveFindings).toHaveLength(1);
  expect(wrong.authority.authorityAlarms.length).toBeGreaterThan(0);
  const outside = drive({ [SUBJECT]: 'export const clean = "w-full";', "packages/server/src/example.ts": 'export const value = "w-[137px]";' });
  expect(outside.authority.effectiveFindings).toEqual([]);
});

test("the migrated product permissions cover only their live occurrences", () => {
  const files = {
    [SUBJECT]: readFileSync(new URL("../../../../packages/ui/src/layout/variants.ts", import.meta.url), "utf8"),
    "packages/ui/src/markdown/markdown.tsx": readFileSync(new URL("../../../../packages/ui/src/markdown/markdown.tsx", import.meta.url), "utf8"),
  };
  const result = drive(files);
  expect(result.authority.effectiveFindings).toEqual([]);
  const unmarked = Object.fromEntries(Object.entries(files).map(([path, source]) => [path, source.replace(/^.*@orb-waive no-arbitrary-tw-values.*$/gmu, "")]));
  const raw = drive(unmarked);
  expect(raw.authority.effectiveFindings.length).toBeGreaterThan(0);
  expect(result.authority.waivedFindings).toHaveLength(raw.authority.effectiveFindings.length);
  expect(result.authority.authorityAlarms.filter((alarm) => alarm.policyId === gate.id)).toEqual([]);
});
