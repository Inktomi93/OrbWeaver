// Fixture export types and native assertions retain separate source subjects and exception authority.

import { expect, plantFile, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import { Project } from "ts-morph";
import ts from "typescript";
import tseslint from "typescript-eslint";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate } from "../../../../tooling/src/verify/gates/no-opaque-test-fixture.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { nativeFabricationPlugin } from "../ops/_fixtures/native-fabrication-candidate.ts";

const ROOT = "/no-opaque-test-fixture";
const FIXTURE = "tests/client/features/rpg/fixtures.ts";

interface Run {
  readonly hits: readonly string[];
  readonly waived: number;
  readonly alarms: readonly string[];
}

function run(policies: readonly GatePolicy[], files: Readonly<Record<string, string>>): Run {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  const result = runPolicyPass({
    knownPolicies: policies,
    policies,
    root: ROOT,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  return {
    hits: result.authority.effectiveFindings.map((finding) => `${finding.policyId}@${finding.line}`),
    waived: result.authority.waivedFindings.length,
    alarms: result.authority.authorityAlarms.map((alarm) => `${alarm.kind}:${alarm.policyId}`),
  };
}

async function nativeFindings(root: string, repoRoot: string, source: string): Promise<readonly string[]> {
  const path = plantFile(root, FIXTURE, source);
  const program = ts.createProgram([path], { strict: true, noLib: true, types: [] });
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(FIXTURE);
  const rules = ["orb/no-test-fabrication", "@typescript-eslint/consistent-type-assertions", "@typescript-eslint/no-unsafe-type-assertion"];
  expect(rules.map((id) => config?.rules?.[id]?.[0])).toEqual([2, 2, 2]);
  const messages = new Linter({ cwd: root }).verify(
    source,
    {
      files: ["**/*.ts"],
      plugins: { ...config?.plugins, "@typescript-eslint": nativeFabricationPlugin(root, repoRoot) },
      languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], projectService: false } },
      rules: Object.fromEntries(rules.map((id) => [id, config?.rules?.[id]])),
    },
    { filename: path },
  );
  expect(messages.some(({ fatal }) => fatal === true)).toBe(false);
  return messages.map(({ ruleId, line }) => `${ruleId}@${line}`).toSorted((left, right) => left.localeCompare(right));
}

test("the policy's own declared proofs hold through the production dispatcher", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("the descriptor shape is the thing under test: ordinary, error, selected-files, singleton family", () => {
  expect([gate.id, gate.family, gate.authority, gate.severity, gate.analysis, gate.execution]).toEqual([
    "no-opaque-test-fixture",
    "no-opaque-test-fixture",
    "ordinary",
    "error",
    "types",
    "selected-files",
  ]);
});

// §4.2. The marker names `unknown`, which is the ANNOTATION — the token the module reports and the fix
// text promises. One raw finding, one consumed, nothing left, nothing complained about.
test("the reported position IS the waiver position: one consumed, zero effective, zero alarms", () => {
  const waived = run([gate], {
    [FIXTURE]:
      "// @orb-waive no-opaque-test-fixture(unknown): the family-test stand-in reason; ends when this fixture stops flagging.\nexport function makeGame(): unknown {\n  return {};\n}\n",
  });
  expect({ hits: waived.hits, waived: waived.waived, alarms: waived.alarms }).toEqual({ hits: [], waived: 1, alarms: [] });
});

// THE DISCRIMINATION CONTROL, committed rather than run by hand: the same policy, the same statement, a
// position this policy never reports. A marker engine keyed on the carrier alone would suppress here too.
test("a marker naming a position the policy never reports ALARMS instead of suppressing", () => {
  const offByOne = run([gate], {
    [FIXTURE]:
      "// @orb-waive no-opaque-test-fixture(makeGame): the family-test stand-in reason; ends when this fixture stops flagging.\nexport function makeGame(): unknown {\n  return {};\n}\n",
  });
  expect(offByOne.waived).toBe(0);
  expect(offByOne.hits).toHaveLength(1);
  expect(offByOne.alarms.join(" | ")).toContain("no-opaque-test-fixture");
});

test("opaque fixture declarations remain distinct from every native assertion finding on the same source", async ({ scratch, repoRoot }) => {
  const source =
    "interface Game {\n" +
    "  readonly ruleset: string;\n" +
    "}\n" +
    "export function makeGame(): unknown {\n" +
    "  return {};\n" +
    "}\n" +
    "export function fabricate(): Game {\n" +
    "  return {} as unknown as Game;\n" +
    "}\n";
  const opaque = run([gate], { [FIXTURE]: source });
  expect(opaque.alarms).toEqual([]);
  expect(opaque.hits).toEqual(["no-opaque-test-fixture@4"]);
  expect(await nativeFindings(scratch, repoRoot, source)).toEqual(
    ["orb/no-test-fabrication@8", "@typescript-eslint/consistent-type-assertions@8", "@typescript-eslint/no-unsafe-type-assertion@8"].toSorted((left, right) =>
      left.localeCompare(right),
    ),
  );
});

test("native assertion rules leave an unknown fixture export clean without hiding the KEEP declaration finding", async ({ scratch, repoRoot }) => {
  const source = "export function makeGame(): unknown {\n  return {};\n}\n";
  expect(await nativeFindings(scratch, repoRoot, source)).toEqual([]);
  expect(run([gate], { [FIXTURE]: source }).hits).toEqual(["no-opaque-test-fixture@1"]);
});
