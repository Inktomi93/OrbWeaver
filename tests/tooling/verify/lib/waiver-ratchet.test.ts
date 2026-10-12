// The waiver ratchet through the authority coordinator: a policy's waived plus granted count must equal its budget,
// judged only for a whole-coverage owner, and only when a budget is handed in.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type {
  GateAuthorityAlarm,
  GateAuthorityBatchInput,
  GateOwnerResult,
  ReviewedGateGrant,
} from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { coordinateGateAuthority } from "../../../../tooling/src/verify/lib/gate-authority.ts";
import { WAIVER_BUDGET } from "../../../../tooling/src/verify/lib/waiver-budget.ts";

const POLICY = { id: "reviewed-policy", authority: "reviewed-grant", severity: "error" } as const;
const GRANT: ReviewedGateGrant = { id: "reviewed-policy:a", policyId: POLICY.id, subject: "a.ts", operation: "op", why: "w", endsWhen: "e" };

function run(budget: GateAuthorityBatchInput["waiverBudget"], coverage: GateOwnerResult["coverage"] = "whole"): GateAuthorityBatchInput {
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

const budgetAlarms = (input: GateAuthorityBatchInput): readonly GateAuthorityAlarm[] =>
  coordinateGateAuthority(input).authorityAlarms.filter(({ kind }) => kind === "waiver-budget");

test("a count equal to its budget is silent; a rise and a fall each red with the count and the budget", () => {
  expect(budgetAlarms(run({ [POLICY.id]: 1 }))).toEqual([]);
  expect(budgetAlarms(run({}))).toMatchObject([{ policyId: POLICY.id, budget: 0, count: 1, message: expect.stringContaining("fix the new finding") }]);
  expect(budgetAlarms(run({ [POLICY.id]: 2 }))).toMatchObject([
    { policyId: POLICY.id, budget: 2, count: 1, message: expect.stringContaining("lower its budget to 1") },
  ]);
});

test("a ratchet alarm blocks the run", () => {
  expect(coordinateGateAuthority(run({})).verdict.blocking).toBe(1);
});

test("a subset owner and a pass with no budget judge nothing", () => {
  expect(budgetAlarms(run({}, "subset"))).toEqual([]);
  expect(budgetAlarms(run(undefined))).toEqual([]);
});

test("every budget row names a final policy module", ({ repoRoot }) => {
  const missing = Object.keys(WAIVER_BUDGET).filter((id) => !existsSync(join(repoRoot, "tooling/src/verify/gates", `${id}.ts`)));
  expect(missing).toEqual([]);
});
