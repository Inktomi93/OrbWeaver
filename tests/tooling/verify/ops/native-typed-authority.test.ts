import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/suppressions.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";

const SUBJECTS = [
  "packages/contracts/src/plugin/bridge.ts",
  "packages/contracts/src/plugin/host-v1.ts",
  "packages/contracts/src/plugin/owner-reads.ts",
  "packages/server/src/domain/plugin/contract/ops.ts",
  "packages/server/src/domain/plugin/contract/errors.ts",
  "packages/server/src/domain/plugin/substrate/bridge.ts",
  "packages/server/src/infra/plugin-host/net-egress.ts",
  "packages/server/src/entry/compose/automation-plugin.ts",
  "packages/server/src/primitives/serde/chat-bundle/index.ts",
  "packages/client/src/lib/session-channel.ts",
  "tests/support/node/atlas-guest.ts",
  "tests/tooling/tool-guard.int.test.ts",
  "tests/tooling/trpc-brand-input.test-d.ts",
  "packages/client/src/data/create-entity-mutation.ts",
  "packages/client/src/data/invalidation-carrier.ts",
  "packages/client/src/data/invalidation.ts",
  "packages/client/src/data/peek-query.ts",
  "packages/client/src/data/use-start-chat.ts",
  "packages/kit/src/time/index.ts",
  "packages/server/src/entry/lifecycle.ts",
] as const;
const CLASSES = [
  ["orb/brand-in-name-position", "source"],
  ["orb/brand-in-name-position", "tests"],
  ["orb/client-cache-surgery-only-in-data", "source"],
  ["orb/no-inline-invalidate-outside-seam", "source"],
  ["orb/no-raw-clock", "source"],
  ["orb/no-raw-intl-time", "source"],
] as const;

function drive(files: Readonly<Record<string, string>>, grants: typeof REVIEWED_GRANTS): ReturnType<typeof runPolicyPass> {
  const root = "/native-typed-authority";
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${root}/${path}`, source);
  }
  const result = runPolicyPass({ root, project, knownPolicies: [gate], policies: [gate], reviewedGrants: grants, failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  return result;
}

test("actual typed-native permissions retain their canonical source/tests class authority and exact current sites", ({ repoRoot }) => {
  const files = Object.fromEntries(SUBJECTS.map((path) => [path, readFileSync(join(repoRoot, path), "utf8")]));
  const raw = drive(files, []);
  const findings = raw.policies.flatMap((policy) => policy.findings);
  const grants = REVIEWED_GRANTS.filter(
    (grant) => grant.policyId === gate.id && findings.some((finding) => finding.subject === grant.subject && finding.operation === grant.operation),
  );
  const result = drive(files, grants);
  for (const [rule, operation] of CLASSES) {
    const actual = findings.filter((finding) => finding.subject === rule && finding.operation === operation);
    expect(actual, `${rule}/${operation}`).toHaveLength(1);
    for (const [path, source] of Object.entries(files)) {
      if ((path.startsWith("tests/") ? "tests" : "source") !== operation) {
        continue;
      }
      const lines = source.split("\n").flatMap((line, index) => (/^\s*\/\/ eslint-disable-next-line /u.test(line) && line.includes(rule) ? [index + 1] : []));
      for (const line of lines) {
        expect(actual[0]?.message).toContain(`${path}:${line} (eslint-disable-next-line)`);
      }
    }
    expect(
      result.authority.grantedFindings.filter(({ finding }) => finding.subject === rule && finding.operation === operation),
      `${rule}/${operation}`,
    ).toHaveLength(1);
    expect(result.authority.effectiveFindings.filter((finding) => finding.subject === rule && finding.operation === operation)).toEqual([]);
  }
  const removed = Object.fromEntries(
    Object.entries(files).map(([path, source]) => [
      path,
      source
        .split("\n")
        .filter((line) => !(/^\s*\/\/ eslint-disable-next-line /u.test(line) && CLASSES.some(([rule]) => line.includes(rule))))
        .join("\n"),
    ]),
  );
  const stale = drive(removed, grants);
  for (const [rule, operation] of CLASSES) {
    const grant = grants.find((candidate) => candidate.subject === rule && candidate.operation === operation);
    expect(grant, `${rule}/${operation}`).toBeDefined();
    expect(stale.authority.authorityAlarms).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "stale-reviewed-grant", grantId: grant?.id })]));
  }
});

test("native permission classes license neither a foreign rule nor a source-only class in tests", () => {
  const grants = REVIEWED_GRANTS.filter(
    (grant) => grant.policyId === gate.id && CLASSES.some(([rule, operation]) => grant.subject === rule && grant.operation === operation),
  );
  for (const [path, rule] of [
    ["packages/client/src/foreign.ts", "orb/typed-native-unlicensed"],
    ["tests/tooling/foreign.test.ts", "orb/no-raw-clock"],
  ] as const) {
    const result = drive({ [path]: `// eslint-disable-next-line ${rule} -- Authority identity control.\nexport const value=true;` }, grants);
    expect(result.authority.grantedFindings).toEqual([]);
    expect(result.authority.effectiveFindings).toMatchObject([{ subject: rule, operation: path.startsWith("tests/") ? "tests" : "source" }]);
  }
});
