import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as write } from "../../../../tooling/src/verify/gates/json-column-write-parity.ts";
import { gate as open } from "../../../../tooling/src/verify/gates/open-json-column-key-parity.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { isolatedTypeFacts } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { ctxFor } from "../../_support.ts";

const SCHEMA = "packages/db/src/schema/index.ts";
const IMPORT = 'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n';

function run(policy: GatePolicy, files: Record<string, string>): ReturnType<typeof runPolicyPass> {
  const { project, root } = ctxFor(files);
  return runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("an actual unreadable versioned-config owner withholds JSON writer analysis", () => {
  const result = run(write, {
    [SCHEMA]: `${IMPORT}export const notes = sqliteTable("notes", { body: text("body", { mode: "json" }) });`,
    "packages/contracts/src/settings/index.ts":
      "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });",
    "packages/contracts/src/preset/index.ts": "export const promptConfigConfig = defineVersionedConfig({ schema: s, version: 1, lifts: {}, default: d });",
  });
  expect(result.toolErrors).toMatchObject([
    { policyId: write.id, phase: "evaluate", message: expect.stringContaining("Unreadable declaration: promptConfigConfig") },
  ]);
  expect(result.authority.withheldPolicyIds).toEqual([write.id]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

test("an unversioned JSON corpus does not require an unrelated versioned owner", () => {
  const result = run(write, {
    [SCHEMA]: `${IMPORT}export const notes = sqliteTable("notes", { body: text("body", { mode: "json" }) });`,
    "packages/contracts/src/settings/index.ts": "export const unrelatedContract = true;",
  });
  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

for (const policy of [write, open]) {
  test(`${policy.id} accepts a readable schema with no JSON subjects`, () => {
    const result = run(policy, { [SCHEMA]: `${IMPORT}export const notes = sqliteTable("notes", { id: text("id") });` });
    expect(result.factErrors).toEqual([]);
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toEqual([]);
  });

  test(`${policy.id} refuses unreadable actual schema input`, () => {
    const result = run(policy, { [SCHEMA]: `${IMPORT}const columns = makeColumns(); export const notes = sqliteTable("notes", columns);` });
    expect(result.toolErrors).toMatchObject([{ policyId: policy.id, phase: "evaluate", message: expect.stringContaining("drizzle schema fact unresolved") }]);
    expect(result.authority.withheldPolicyIds).toEqual([policy.id]);
    expect(result.authority.effectiveFindings).toEqual([]);
  });
}
