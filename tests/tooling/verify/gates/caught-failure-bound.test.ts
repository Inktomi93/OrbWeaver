// The D328 bound at gate level: a row past the closure bound has no finding, so its mustPass arm alone would
// also hold for a gate that silently called it clean. This suite asserts the explicit unknown each one reports.
// @subject tooling/src/floor/code-facts/bounded-closure.ts
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, ts } from "ts-morph";
import type { GatePolicy, GatePolicyProof } from "../../../../tooling/src/verify/contract/policy.ts";
import { JSON_RESOURCE_PATHS } from "../../../../tooling/src/verify/contract/resource-json.ts";
import { gate as censusRow } from "../../../../tooling/src/verify/gates/caught-failure-census-row.ts";
import { gate as ownership } from "../../../../tooling/src/verify/gates/caught-failure-ownership.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/caught-failure-ownership-health.ts";
import { gate as fixtureSubstrate } from "../../../../tooling/src/verify/gates/policy-fixture-substrate.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { isolatedTypeFacts } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = "/bound";
const POPULATION = JSON_RESOURCE_PATHS["caught-failure-population"];
// The rows this suite owns are the ones whose reason names the bound; a renamed reason fails the count below.
const PAST_THE_BOUND = "D328 PAST THE BOUND";

type Analysis = NonNullable<ReturnType<typeof runPolicyPass>["policies"][number]["analysis"]>;

function analysisOf(policy: GatePolicy, proof: GatePolicyProof): Analysis {
  const analysis = cleanPassAnalysis(policy, proof);
  if (analysis === undefined) {
    throw new Error(`${policy.id} reported no analysis coverage`);
  }
  return analysis;
}

// A clean pass's analysis; undefined when the policy reported none, which means it reported no unknown.
function cleanPassAnalysis(policy: GatePolicy, proof: GatePolicyProof): Analysis | undefined {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true, target: ts.ScriptTarget.ES2022 } });
  const overlay: Record<string, string> = {};
  for (const [path, text] of Object.entries(proof.files)) {
    if (path === POPULATION) {
      overlay[path] = text;
    } else {
      project.createSourceFile(`${ROOT}/${path}`, text);
    }
  }
  const result = runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root: ROOT,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    resourceOptions: { overlay },
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  return result.policies[0]?.analysis;
}

function pastRows(policy: GatePolicy): readonly GatePolicyProof[] {
  return policy.mustPass.filter((proof) => proof.why.startsWith(PAST_THE_BOUND));
}

test.each([
  [ownership, 2],
  [censusRow, 1],
  [health, 1],
  [fixtureSubstrate, 2],
] as const)("every past-the-bound row of %s reports an explicit unknown, never a clean pass", (policy, rows) => {
  const proofs = pastRows(policy);
  expect(proofs).toHaveLength(rows);
  for (const proof of proofs) {
    const { unknown } = analysisOf(policy, proof);
    expect(unknown, proof.why).toEqual(expect.arrayContaining([expect.objectContaining({ reason: expect.stringContaining("past the closure bound") })]));
  }
});

test("a handler spelling the rejection reader unwraps is walked and owned, never pushed past the bound", { timeout: scaledBudget(30_000) }, () => {
  const spellings = ownership.mustPass.filter((proof) => proof.why.startsWith("D328 HANDLER SPELLING"));
  expect(spellings.length).toBeGreaterThan(0);
  const unknowns = Object.fromEntries(spellings.map((proof) => [proof.why, (cleanPassAnalysis(ownership, proof)?.unknown ?? []).map(({ reason }) => reason)]));
  expect(unknowns).toEqual(Object.fromEntries(spellings.map((proof) => [proof.why, []])));
});

test("each census join names the id it withholds, with the withheld count", () => {
  const [live] = pastRows(censusRow);
  const [committed] = pastRows(health);
  if (live === undefined || committed === undefined) {
    throw new Error("the census joins lost their past-the-bound rows");
  }
  const withheld = (analysis: Analysis): readonly string[] => analysis.unknown.map(({ reason }) => reason).filter((reason) => reason.includes("withholds"));
  expect(withheld(analysisOf(censusRow, live))).toEqual([expect.stringContaining("withholds 1 of 1 withheld id(s)")]);
  expect(withheld(analysisOf(censusRow, live))[0]).toContain("absorb::catch::1`");
  expect(withheld(analysisOf(health, committed))).toEqual([expect.stringContaining("absorb::catch::2`")]);
});
