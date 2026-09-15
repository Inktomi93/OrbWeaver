import { readFileSync } from "node:fs";
import { Project } from "ts-morph";
import { gate as health } from "../../../../tooling/src/verify/gates/floorless-control-vocabulary-health.ts";
import { gate } from "../../../../tooling/src/verify/gates/no-floorless-control-in-wrap.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/floorless-conversion";
const SUBJECT = "packages/client/src/features/rpg/components/rpg-pack-rows.tsx";
const WRAP = 'export const Grid = <Row className="flex-wrap">{xs.map(x => <Button size="glyph-lg" />)}</Row>;';
function drive(files: Readonly<Record<string, string>>, requestedPaths?: readonly string[]): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  const result = runPolicyPass({
    knownPolicies: [gate, health],
    policies: [gate, health],
    project,
    root: ROOT,
    reviewedGrants: [],
    failOnWarnings: false,
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  return result;
}

test("preserves every legacy collision and vocabulary proof through the two authority owners", () => {
  expect(verifyPolicyProofs([gate, health])).toEqual([]);
});

test("exact geometry permission does not exempt another occurrence and goes stale when fixed", () => {
  const source = `// @orb-waive no-floorless-control-in-wrap(glyph-lg): measured spacing remedy.\n${WRAP}\nexport const second = <Row className="flex-wrap">{xs.map(x => <Button size="inline" />)}</Row>;`;
  const result = drive({ [SUBJECT]: source });
  expect(result.authority.waivedFindings.map((f) => f.finding.token)).toEqual(["glyph-lg"]);
  expect(result.authority.effectiveFindings.map((f) => f.token)).toEqual(["inline"]);
  const wrong = drive({ [SUBJECT]: `// @orb-waive no-floorless-control-in-wrap(glyph): wrong position.\n${WRAP}` });
  expect(wrong.authority.waivedFindings).toEqual([]);
  expect(wrong.authority.effectiveFindings).toHaveLength(1);
  expect(wrong.authority.authorityAlarms.length).toBeGreaterThan(0);
  const stale = drive({
    [SUBJECT]: `// @orb-waive no-floorless-control-in-wrap(glyph-lg): former spacing remedy.\n${WRAP.replace('size="glyph-lg"', 'size="sm"')}`,
  });
  expect(stale.authority.effectiveFindings).toEqual([]);
  expect(stale.authority.authorityAlarms.length).toBeGreaterThan(0);
});

test("shared whole-population evidence defers a narrowed run instead of claiming a clean verdict", () => {
  const files = { [SUBJECT]: WRAP, "packages/client/src/clean.ts": "export const clean = true;" };
  expect(drive(files).authority.effectiveFindings).toHaveLength(1);
  const scoped = drive(files, ["packages/client/src/clean.ts"]);
  expect(scoped.policies).toHaveLength(2);
  for (const policy of scoped.policies) {
    expect(policy.owner).toMatchObject({ status: "not-applicable", reason: "entire-population policy deferred for a proper subset selection" });
  }
});

test("the ruled product sites keep their geometry and only their exact occurrences are licensed", () => {
  const files = {
    [SUBJECT]: readFileSync(new URL("../../../../packages/client/src/features/rpg/components/rpg-pack-rows.tsx", import.meta.url), "utf8"),
    "packages/client/src/features/rpg/components/rpg-actor-trackers.tsx": readFileSync(
      new URL("../../../../packages/client/src/features/rpg/components/rpg-actor-trackers.tsx", import.meta.url),
      "utf8",
    ),
  };
  const result = drive(files);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.waivedFindings).toHaveLength(2);
  expect(result.authority.authorityAlarms.filter((a) => a.policyId === gate.id)).toEqual([]);
  const raw = Object.fromEntries(Object.entries(files).map(([path, source]) => [path, source.replace(/^.*@orb-waive no-floorless-control-in-wrap.*$/gmu, "")]));
  expect(
    drive(raw)
      .authority.effectiveFindings.map((f) => f.token)
      .sort(),
  ).toEqual(["glyph-lg", "glyph-xs"]);
});
