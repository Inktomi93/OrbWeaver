// Inference-specific mirror topology controls. These drive the production policy through runPolicyPass so
// a missing required test is a finding, while missing/empty/unreadable corpora withhold the owner. The
// healthy twin asserts both bounded denominators rather than accepting a clean zero.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Project } from "ts-morph";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate } from "../../../../tooling/src/verify/gates/test-presence-inference.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SOURCE = "packages/inference/src/extensions/normalize.ts";
const TEST = "tests/inference/extensions/normalize.test.ts";
const SOURCE_TEXT = "export function normalize(value: string): string {\n  return value.trim();\n}\n";
const POLICY_ID = "test-presence-inference";

function pass(root: string, overlay: Readonly<Record<string, string>>): PolicyPassResult {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const [path, content] of Object.entries(overlay)) {
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      project.createSourceFile(`${root}/${path}`, content);
    }
  }
  return runPolicyPass({ knownPolicies: [gate], policies: [gate], root, project, resourceOptions: { overlay }, reviewedGrants: [], failOnWarnings: false });
}

function plant(root: string, path: string, text: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, text);
}

function refusalShape(result: PolicyPassResult): Record<string, unknown> {
  return {
    findings: result.policies.flatMap(({ findings }) => findings),
    effective: result.authority.effectiveFindings,
    withheld: result.authority.withheldPolicyIds,
    errors: result.toolErrors.map(({ message }) => message),
  };
}

function refusalFor(fragment: string): Record<string, unknown> {
  return { findings: [], effective: [], withheld: [POLICY_ID], errors: [expect.stringContaining(fragment)] };
}

test("a missing required inference mirror is a blocking finding", ({ scratch }) => {
  const result = pass(scratch, { [SOURCE]: SOURCE_TEXT, "tests/inference/other.test.ts": "export {};\n" });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: gate.id, file: SOURCE, severity: "error" }]);
  expect(result.authority.verdict.blocking).toBe(1);
});

test("a healthy inference mirror publishes the complete source and test denominators", ({ scratch }) => {
  const result = pass(scratch, { [SOURCE]: SOURCE_TEXT, [TEST]: "export {};\n" });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(
    result.policies[0]?.receipts.map((receipt) => [receipt.source, receipt.kind === "population" ? receipt.members : receipt.resources, receipt.unresolved]),
  ).toEqual([
    ["inference-source-files", 1, 0],
    ["inference-test-files", 1, 0],
    ["inference-topology [exact=1,suite=0,non-runtime=0,uncovered=0]", 1, 0],
    ["mirror-index:inference-test", 2, 0],
  ]);
});

test("an empty inference source corpus refuses instead of returning clean zero", ({ scratch }) => {
  mkdirSync(join(scratch, "packages/inference/src"), { recursive: true });
  const result = pass(scratch, { [TEST]: "export {};\n" });

  expect(refusalShape(result)).toEqual(refusalFor("mirror-index:inference-test is empty"));
});

test("an empty inference test corpus refuses instead of accusing every source", ({ scratch }) => {
  mkdirSync(join(scratch, "tests/inference"), { recursive: true });
  const result = pass(scratch, { [SOURCE]: SOURCE_TEXT });

  expect(refusalShape(result)).toEqual(refusalFor("mirror-index:inference-test is empty"));
});

test("an unreadable inference source corpus refuses", ({ scratch }) => {
  plant(scratch, "packages/inference/src/live.ts", "export const live = 1;\n");
  symlinkSync("live.ts", join(scratch, "packages/inference/src/linked.ts"));
  const result = pass(scratch, { [SOURCE]: SOURCE_TEXT, [TEST]: "export {};\n" });

  expect(refusalShape(result)).toEqual(refusalFor("mirror-index:inference-test is unresolved"));
});

test("an unreadable inference test corpus refuses", ({ scratch }) => {
  plant(scratch, "tests/inference/live.test.ts", "export {};\n");
  symlinkSync("live.test.ts", join(scratch, "tests/inference/linked.test.ts"));
  const result = pass(scratch, { [SOURCE]: SOURCE_TEXT, [TEST]: "export {};\n" });

  expect(refusalShape(result)).toEqual(refusalFor("mirror-index:inference-test is unresolved"));
});
