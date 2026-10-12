// The waiver ratchet: an application run judges each policy's application row, a whole-tree run judges the
// application plus implementation rows, and only a run that walked part of a population reports it unjudged.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, SyntaxKind } from "ts-morph";
import type {
  GateAuthorityAlarm,
  GateAuthorityBatchInput,
  GateOwnerResult,
  ReviewedGateGrant,
  WaiverBudget,
} from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { WAIVER_BUDGET_PARTS } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassInput, PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { coordinateGateAuthority } from "../../../../tooling/src/verify/lib/gate-authority.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { WAIVER_BUDGET } from "../../../../tooling/src/verify/lib/waiver-budget.ts";

const POLICY = { id: "reviewed-policy", authority: "reviewed-grant", severity: "error" } as const;
const GRANT: ReviewedGateGrant = { id: "reviewed-policy:a", policyId: POLICY.id, subject: "a.ts", operation: "op", why: "w", endsWhen: "e" };

const budgetOf = (applicationRow: number, implementationRow = 0): WaiverBudget => ({
  application: { [POLICY.id]: applicationRow },
  implementation: { [POLICY.id]: implementationRow },
});

function batch(budget: WaiverBudget | undefined, coverage: GateOwnerResult["coverage"] = "whole"): GateAuthorityBatchInput {
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
    ...(budget === undefined ? {} : { waiverBudget: { population: "repository", budget } }),
    failOnWarnings: false,
  };
}

const budgetAlarms = (alarms: readonly GateAuthorityAlarm[]): readonly GateAuthorityAlarm[] => alarms.filter(({ kind }) => kind === "waiver-budget");

test("a count equal to its budget is silent; a rise and a fall each red with the count and the budget", () => {
  expect(budgetAlarms(coordinateGateAuthority(batch(budgetOf(1))).authorityAlarms)).toEqual([]);
  expect(budgetAlarms(coordinateGateAuthority(batch(budgetOf(0))).authorityAlarms)).toMatchObject([
    { policyId: POLICY.id, population: "repository", budget: 0, count: 1, message: expect.stringContaining("fix the new finding") },
  ]);
  expect(budgetAlarms(coordinateGateAuthority(batch(budgetOf(1, 1))).authorityAlarms)).toMatchObject([
    { policyId: POLICY.id, population: "repository", budget: 2, count: 1, message: expect.stringContaining("application plus implementation equals 1") },
  ]);
});

test("a ratchet alarm blocks the run", () => {
  expect(coordinateGateAuthority(batch(budgetOf(0))).verdict.blocking).toBe(1);
});

test("a pass with no budget judges nothing and reports no budget verdict", () => {
  const result = coordinateGateAuthority(batch(undefined));
  expect(budgetAlarms(result.authorityAlarms)).toEqual([]);
  expect(result.waiverBudget).toBeNull();
});

test("every budget row names a final policy module", ({ repoRoot }) => {
  const missing = WAIVER_BUDGET_PARTS.flatMap((part) => Object.keys(WAIVER_BUDGET[part])).filter(
    (id) => !existsSync(join(repoRoot, "tooling/src/verify/gates", `${id}.ts`)),
  );
  expect(missing).toEqual([]);
});

// Through the production pass, so the selection, not the caller, fixes the judged population. `app.ts` and
// `server.ts` are application subjects; `tool.ts` and `tool-only.ts` are not, the shape tests/tooling has under the
// real application run. SPANNING declares an application file and a tooling file; CONTAINED declares only an
// application file; TOOLING declares only a tooling file, so an application run finds it not applicable.
const ROOT = "/repo";
const APP = "packages/client/src/app.ts";
const TOOL = "packages/client/src/tool.ts";
const SERVER = "packages/server/src/server.ts";
const TOOL_ONLY = "packages/ui/src/tool-only.ts";
const APPLICATION_PATHS = [APP, SERVER];

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
const TOOLING = excusingPolicy("tooling-fixture", "@ui", TOOL_ONLY);
const POLICIES = [SPANNING, CONTAINED, TOOLING];

const waived = (policyId: string, names: readonly string[]): string =>
  names.map((name) => `// @orb-waive ${policyId}(${name}): fixture excuse\nexport const ${name} = 1;\n`).join("");

/** SPANNING's application and tooling excuses; CONTAINED and TOOLING stay at budget. */
function tree(app: readonly string[], tool: readonly string[]): Readonly<Record<string, string>> {
  return {
    [APP]: waived(SPANNING.id, app),
    [TOOL]: waived(SPANNING.id, tool),
    [SERVER]: waived(CONTAINED.id, ["serverExcuse"]),
    [TOOL_ONLY]: waived(TOOLING.id, ["toolOnlyExcuse"]),
  };
}

const BUDGET: WaiverBudget = {
  application: { [SPANNING.id]: 1, [CONTAINED.id]: 1 },
  implementation: { [SPANNING.id]: 1, [TOOLING.id]: 1 },
};
const AT_BUDGET = tree(["appExcuse"], ["toolExcuse"]);

function pass(files: Readonly<Record<string, string>>, overrides: Partial<PolicyPassInput> = {}): PolicyPassResult {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({
    knownPolicies: POLICIES,
    policies: POLICIES,
    root: ROOT,
    project,
    reviewedGrants: [],
    waiverBudget: BUDGET,
    failOnWarnings: false,
    ...overrides,
  });
}

const wholeTree = (files: Readonly<Record<string, string>>): PolicyPassResult => pass(files);
const application = (files: Readonly<Record<string, string>>): PolicyPassResult => pass(files, { applicationPaths: APPLICATION_PATHS });
const ratchet = (result: PolicyPassResult): readonly GateAuthorityAlarm[] => budgetAlarms(result.authority.authorityAlarms);
const ALL_JUDGED = [CONTAINED.id, SPANNING.id, TOOLING.id];

// The planted disagreement: the old ratchet judged only whole-coverage owners and said nothing about the rest, so
// the application run (CI) judged none of the policies that span tooling and never reported that.
test("both selections judge every policy at budget: the application run its application part, the whole-tree run both", () => {
  expect(ratchet(application(AT_BUDGET))).toEqual([]);
  expect(application(AT_BUDGET).authority.waiverBudget).toEqual({ population: "application", judged: ALL_JUDGED, unjudged: [] });
  expect(ratchet(wholeTree(AT_BUDGET))).toEqual([]);
  expect(wholeTree(AT_BUDGET).authority.waiverBudget).toEqual({ population: "repository", judged: ALL_JUDGED, unjudged: [] });
});

test("a new application excuse reds both selections", () => {
  const risen = tree(["appExcuse", "newAppExcuse"], ["toolExcuse"]);
  expect(ratchet(application(risen))).toMatchObject([{ policyId: SPANNING.id, population: "application", budget: 1, count: 2 }]);
  expect(ratchet(wholeTree(risen))).toMatchObject([{ policyId: SPANNING.id, population: "repository", budget: 2, count: 3 }]);
});

test("a removed application excuse reds both selections until the application row falls", () => {
  const fallen = tree([], ["toolExcuse"]);
  expect(ratchet(application(fallen))).toMatchObject([
    { policyId: SPANNING.id, population: "application", budget: 1, count: 0, message: expect.stringContaining("lower its application row to 0") },
  ]);
  expect(ratchet(wholeTree(fallen))).toMatchObject([{ policyId: SPANNING.id, population: "repository", budget: 2, count: 1 }]);
});

// A tooling file is outside the population an application run walks, so that run judges the policy's application
// part unchanged and stays silent; the whole-tree run is the selection that walks the tooling file.
test("a new tooling excuse reds the whole-tree run while the application run judges its application part clean", () => {
  const risen = tree(["appExcuse"], ["toolExcuse", "newToolExcuse"]);
  expect(ratchet(wholeTree(risen))).toMatchObject([{ policyId: SPANNING.id, population: "repository", budget: 2, count: 3 }]);
  expect(ratchet(application(risen))).toEqual([]);
  expect(application(risen).authority.waiverBudget?.judged).toEqual(ALL_JUDGED);
});

test("a removed tooling excuse reds the whole-tree run while the application run judges its application part clean", () => {
  const fallen = tree(["appExcuse"], []);
  expect(ratchet(wholeTree(fallen))).toMatchObject([
    { policyId: SPANNING.id, population: "repository", budget: 2, count: 1, message: expect.stringContaining("implementation row moves") },
  ]);
  expect(ratchet(application(fallen))).toEqual([]);
  expect(application(fallen).authority.waiverBudget?.judged).toEqual(ALL_JUDGED);
});

test("an application run judges a policy with no application subject against its application row", () => {
  const result = application(AT_BUDGET);
  expect(result.policies.find(({ id }) => id === TOOLING.id)?.owner.status).toBe("not-applicable");
  expect(result.authority.waiverBudget?.judged).toContain(TOOLING.id);
});

test("only a requested-path subset reports a policy unjudged, and never passes it", () => {
  const result = pass(tree(["appExcuse", "newAppExcuse"], ["toolExcuse"]), { requestedPaths: [APP] });
  expect(ratchet(result)).toEqual([]);
  expect(result.authority.waiverBudget).toEqual({ population: "repository", judged: [], unjudged: ALL_JUDGED });
});
