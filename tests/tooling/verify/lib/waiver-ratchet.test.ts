// The waiver ratchet: a policy's waived plus granted count over its whole declared population must equal its one
// budget row. Every selection that walked that population judges it alike; any other reports it unjudged.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Project, SyntaxKind } from "ts-morph";
import type {
  GateAuthorityAlarm,
  GateAuthorityBatchInput,
  GateOwnerResult,
  ReviewedGateGrant,
} from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassInput, PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { coordinateGateAuthority } from "../../../../tooling/src/verify/lib/gate-authority.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { WAIVER_BUDGET } from "../../../../tooling/src/verify/lib/waiver-budget.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const POLICY = { id: "reviewed-policy", authority: "reviewed-grant", severity: "error" } as const;
const GRANT: ReviewedGateGrant = { id: "reviewed-policy:a", policyId: POLICY.id, subject: "a.ts", operation: "op", why: "w", endsWhen: "e" };

function batch(budget: GateAuthorityBatchInput["waiverBudget"], coverage: GateOwnerResult["coverage"] = "whole"): GateAuthorityBatchInput {
  return {
    knownPolicies: [POLICY],
    selectedPolicies: [POLICY],
    ordinaryWaiverSources: [],
    ownerResults: [
      {
        policyId: POLICY.id,
        populationFiles: ["a.ts"],
        coverage,
        owner: { status: "success", population: "complete" },
        findings: [{ file: "a.ts", line: 1, column: 1, message: "m", subject: "a.ts", operation: "op" }],
      },
    ],
    reviewedGrants: [GRANT],
    ...(budget === undefined ? {} : { waiverBudget: budget }),
    failOnWarnings: false,
  };
}

const budgetAlarms = (alarms: readonly GateAuthorityAlarm[]): readonly GateAuthorityAlarm[] => alarms.filter(({ kind }) => kind === "waiver-budget");

test("a count equal to its budget is silent; a rise and a fall each red with the count and the budget", () => {
  expect(budgetAlarms(coordinateGateAuthority(batch({ [POLICY.id]: 1 })).authorityAlarms)).toEqual([]);
  expect(budgetAlarms(coordinateGateAuthority(batch({})).authorityAlarms)).toMatchObject([
    { policyId: POLICY.id, budget: 0, count: 1, message: expect.stringContaining("fix the new finding") },
  ]);
  expect(budgetAlarms(coordinateGateAuthority(batch({ [POLICY.id]: 2 })).authorityAlarms)).toMatchObject([
    { policyId: POLICY.id, budget: 2, count: 1, message: expect.stringContaining("lower its budget to 1") },
  ]);
});

test("a ratchet alarm blocks the run", () => {
  expect(coordinateGateAuthority(batch({})).verdict.blocking).toBe(1);
});

test("a pass with no budget judges nothing and reports no budget verdict", () => {
  const result = coordinateGateAuthority(batch(undefined));
  expect(budgetAlarms(result.authorityAlarms)).toEqual([]);
  expect(result.waiverBudget).toBeNull();
});

test("every budget row names a final policy module", ({ repoRoot }) => {
  const missing = Object.keys(WAIVER_BUDGET).filter((id) => !existsSync(join(repoRoot, "tooling/src/verify/gates", `${id}.ts`)));
  expect(missing).toEqual([]);
});

// Through the production pass. `app.ts` and `server.ts` are application subjects and `tool.ts` is not, the shape
// tests/tooling has under the real application run: SPANNING declares both client files, so an application run
// walks only part of it; CONTAINED declares only the server file, which both selections walk whole.
const ROOT = "/repo";
const APP = "packages/client/src/app.ts";
const TOOL = "packages/client/src/tool.ts";
const SERVER = "packages/server/src/server.ts";

function excusingPolicy(id: string, population: GatePolicy["population"], planted: string): GatePolicy {
  return defineGate({
    id,
    family: id,
    authority: "ordinary",
    severity: "error",
    population,
    analysis: "syntax",
    execution: "selected-files",
    facts: [],
    resources: [],
    message: `${id} message`,
    create: (ctx) => ({ visitors: [{ kinds: [SyntaxKind.VariableDeclaration], visit: (node) => ctx.report.node(node) }] }),
    mustFlag: [{ mode: "source", files: { [planted]: "export const planted = true;\n" }, why: "every declaration is a finding" }],
    mustPass: [{ mode: "source", files: { [planted]: "export {};\n" }, why: "no declaration, no finding" }],
  });
}

const SPANNING = excusingPolicy("spanning-fixture", "@client", APP);
const CONTAINED = excusingPolicy("contained-fixture", "@server", SERVER);

const waived = (policyId: string, ...names: readonly string[]): string =>
  names.map((name) => `// @orb-waive ${policyId}(${name}): fixture excuse\nexport const ${name} = 1;\n`).join("");

function tree(serverExcuses: readonly string[], toolExcuses: readonly string[]): Readonly<Record<string, string>> {
  return { [APP]: waived(SPANNING.id, "appExcuse"), [TOOL]: waived(SPANNING.id, ...toolExcuses), [SERVER]: waived(CONTAINED.id, ...serverExcuses) };
}

// One budget row per policy over its whole declared population: SPANNING counts the app and the tooling excuse.
const BUDGET = { [SPANNING.id]: 2, [CONTAINED.id]: 1 };
const AT_BUDGET = tree(["serverExcuse"], ["toolExcuse"]);

function pass(files: Readonly<Record<string, string>>, overrides: Partial<PolicyPassInput> = {}): PolicyPassResult {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({
    knownPolicies: [SPANNING, CONTAINED],
    policies: [SPANNING, CONTAINED],
    root: ROOT,
    project,
    reviewedGrants: [],
    waiverBudget: BUDGET,
    failOnWarnings: false,
    ...overrides,
  });
}

const wholeTree = (files: Readonly<Record<string, string>>): PolicyPassResult => pass(files);
const application = (files: Readonly<Record<string, string>>): PolicyPassResult => pass(files, { applicationPaths: [APP, SERVER] });
const ratchet = (result: PolicyPassResult): readonly GateAuthorityAlarm[] => budgetAlarms(result.authority.authorityAlarms);

// The planted disagreement. The old ratchet judged only whole-coverage owners and never said so: a row measured
// at application scope reds the whole-tree run on the tooling excuse while the application run passes silently.
test("a policy the application run walks only in part is reported unjudged there, never passed", () => {
  const result = application(AT_BUDGET);
  expect(ratchet(result)).toEqual([]);
  expect(result.authority.waiverBudget).toEqual({ judged: [CONTAINED.id], unjudged: [SPANNING.id] });
  expect(wholeTree(AT_BUDGET).authority.waiverBudget).toEqual({ judged: [CONTAINED.id, SPANNING.id], unjudged: [] });
  expect(ratchet(wholeTree(AT_BUDGET))).toEqual([]);
});

test("the one row counts the tooling excuses: a new one reds the whole-tree run", () => {
  expect(ratchet(wholeTree(tree(["serverExcuse"], ["toolExcuse", "newToolExcuse"])))).toMatchObject([{ policyId: SPANNING.id, budget: 2, count: 3 }]);
});

test("a rise in a policy both selections walk whole reds both with the same row, count and message", () => {
  const risen = tree(["serverExcuse", "newServerExcuse"], ["toolExcuse"]);
  const expected = [{ kind: "waiver-budget", policyId: CONTAINED.id, budget: 1, count: 2, message: expect.stringContaining("fix the new finding") }];
  expect(ratchet(wholeTree(risen))).toEqual(expected);
  expect(ratchet(application(risen))).toEqual(expected);
});

test("a requested-path subset reports both policies unjudged instead of passing them", () => {
  const result = pass(tree(["serverExcuse", "newServerExcuse"], ["toolExcuse"]), { requestedPaths: [APP] });
  expect(ratchet(result)).toEqual([]);
  expect(result.authority.waiverBudget?.judged).toEqual([]);
  expect(result.authority.waiverBudget?.unjudged).toContain(SPANNING.id);
});
