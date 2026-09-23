// The §4.5 REFUSAL pin for `dialog-via-composite` (#0038). Its `dialog-root-import` fact counts `ctx.files` and
// throws nothing, and the policy's `@client` population equals the fact's, so the one supply failure it can
// reach is a population that admits zero paths. The dispatcher refuses that at the POPULATION phase in its own
// generic words, which a `mustRefuse` row may not name (`lib/policy-refusal-envelope.ts`), so the refusal
// SHAPE is asserted here. Two-sided: the same run plus one client file reaches a verdict.
// The fact's reading behaviour is pinned in `tests/tooling/verify/lib/dialog-root-import.test.ts`.
import { Project } from "ts-morph";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate } from "../../../../tooling/src/verify/gates/dialog-via-composite.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/dialog-via-composite-refusal";
const OUTSIDE = { "packages/server/src/x.ts": "export const x = 1;" };
const CLIENT = { "packages/client/src/features/demo/x.tsx": "export const x = 1;" };

function pass(files: Readonly<Record<string, string>>): PolicyPassResult {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({ knownPolicies: [gate], policies: [gate], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
}

test("an empty client population refuses at the population phase instead of reading as no raw Dialog import", () => {
  const result = pass(OUTSIDE);
  expect({
    rawFindings: result.policies.flatMap(({ findings }) => findings),
    effectiveFindings: result.authority.effectiveFindings,
    toolErrors: result.toolErrors.map(({ policyId, phase, message }) => ({ policyId, phase, message })),
    owners: result.policies.map(({ id, owner }) => [id, owner.status]),
    withheld: result.authority.withheldPolicyIds,
  }).toEqual({
    rawFindings: [],
    effectiveFindings: [],
    toolErrors: [{ policyId: gate.id, phase: "population", message: expect.stringContaining("admitted zero paths") }],
    owners: [[gate.id, "incomplete"]],
    withheld: [gate.id],
  });
});

test("the same run with one client file reaches a verdict", () => {
  const result = pass({ ...OUTSIDE, ...CLIENT });
  expect(result.toolErrors).toEqual([]);
  expect(result.policies.map(({ id, owner }) => [id, owner.status])).toEqual([[gate.id, "success"]]);
});
