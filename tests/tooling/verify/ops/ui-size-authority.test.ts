import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/suppressions.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";

const ROOT = join(import.meta.dirname, "../../../..");
const RULE = "orb/ui-size-via-variant";
const GRANT = "suppressions:source-orb-ui-size-via-variant";
const SUBJECTS = [
  "packages/client/src/features/character/components/character-library-toolbar.tsx",
  "packages/client/src/features/tag/surfaces/labels-list-surface.tsx",
] as const;

function drive(files: Readonly<Record<string, string>>, granted = true): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`/ui-size-authority/${path}`, source);
  }
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    project,
    root: "/ui-size-authority",
    reviewedGrants: granted ? REVIEWED_GRANTS.filter(({ id }) => id === GRANT) : [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  return result;
}

test("the actual two Select directives aggregate to one live source-class grant", () => {
  const files = Object.fromEntries(SUBJECTS.map((path) => [path, readFileSync(join(ROOT, path), "utf8")]));
  const ungranted = drive(files, false);
  expect(ungranted.authority.effectiveFindings).toHaveLength(1);
  expect(ungranted.authority.effectiveFindings[0]).toMatchObject({ subject: RULE, operation: "source" });
  for (const [path, source] of Object.entries(files)) {
    const line = source.split("\n").findIndex((text) => text.includes(`eslint-disable-next-line ${RULE}`)) + 1;
    expect(line).toBeGreaterThan(0);
    expect(ungranted.authority.effectiveFindings[0]?.message).toContain(`${path}:${line} (eslint-disable-next-line)`);
  }
  const result = drive(files);
  expect(result.authority.grantedFindings).toMatchObject([{ grantId: GRANT, finding: { subject: RULE, operation: "source" } }]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([]);
  expect(result.authority.reviewedGrantConsumption).toEqual([{ id: GRANT, count: 1 }]);

  const removed = Object.fromEntries(
    Object.entries(files).map(([path, source]) => [path, source.replace(/^.*eslint-disable-next-line orb\/ui-size-via-variant.*\r?\n/gmu, "")]),
  );
  const stale = drive(removed);
  expect(stale.authority.grantedFindings).toEqual([]);
  expect(stale.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: GRANT }]);
});

test("the source class grants neither a different rule nor a tests-scope directive", () => {
  for (const [path, rule] of [
    [SUBJECTS[0], "orb/unlicensed-sizing"],
    ["tests/client/ui-size.test.tsx", RULE],
  ] as const) {
    const result = drive({ [path]: `// eslint-disable-next-line ${rule} -- identity control.\nexport const value = true;` });
    expect(result.authority.grantedFindings).toEqual([]);
    expect(result.authority.effectiveFindings).toHaveLength(1);
    expect(result.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: GRANT }]);
  }
});
