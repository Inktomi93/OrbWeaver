// Conformance entry for `no-raw-color-in-css`, plus the §4.5 refusal/receipt pins its resource-backed
// verdict owes and had none of (gate-runtime audit wave 4: the family carried ONE §4.5 pin across nine
// modules, and this is the only one whose verdict rests on a declared RESOURCE).
//
// WHY A PROOF ROW CANNOT EXPRESS THIS. The policy reads its whole subject through
// `readyResourceValue(ctx.resources.cssInventory("authored"))`, and a non-ready resource never reaches
// `evaluate` at all: `resolveResourceDeclarations` refuses during the POPULATION phase, the owner is marked
// incomplete and WITHHELD, and the run surfaces a TOOL ERROR. The conformance runner's `toolFailure`
// precedes every arm verdict (`ops/policy-conformance.ts`), so a row written for that state fails as a
// harness error rather than proving the refusal — which is exactly why `resource-layout-wave-1.suite.test.ts`
// holds the same shape for its two exemplars.
//
// The pin is TWO-SIDED on purpose: the same overlay minus ONE authored tree flips a green verdict into a
// named refusal, which is what rules out "the fixture simply had nothing to find". `authored-css` is
// derived from BOTH `packages/client/src` and `packages/ui/src` (`ops/resource-tree.ts` `loadAuthoredCss`),
// so each tree gets its own arm — a single arm would leave the other half of the derivation unproven, and
// every proof row in the module happens to plant files in both trees, which is why the refusal was never
// reachable from the rows.
import { Project } from "ts-morph";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate } from "../../../../tooling/src/verify/gates/no-raw-color-in-css.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("no-raw-color-in-css final policy proofs remain conformant", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

const CLIENT_TREE = { "packages/client/src/features/x/x.css": ".a {\n  color: #ff0000;\n}\n" } as const;
const UI_TREE = { "packages/ui/src/styles/clean.css": ".clean { color: var(--color-foreground); }\n" } as const;

function cssPass(scratch: string, overlay: Readonly<Record<string, string>>): PolicyPassResult {
  return runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: scratch,
    project: new Project({ skipAddingFilesFromTsConfig: true }),
    resourceOptions: { overlay },
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

/** The four facts that together say "this run is not a verdict" rather than "the tree is clean", read as
 *  one object so a refusal that drifted on ONE axis fails with the whole shape in the diff. */
function refusalShape(result: PolicyPassResult): Record<string, unknown> {
  return {
    findings: result.authority.effectiveFindings,
    toolErrors: result.toolErrors.map(({ policyId, phase }) => ({ policyId, phase })),
    owners: result.policies.map(({ id, owner }) => [id, owner.status]),
    withheld: result.authority.withheldPolicyIds,
  };
}

const REFUSAL = {
  findings: [],
  toolErrors: [{ policyId: "no-raw-color-in-css", phase: "population" }],
  owners: [["no-raw-color-in-css", "incomplete"]],
  withheld: ["no-raw-color-in-css"],
};

test("a complete authored-css population lets the policy reach a verdict and file its declaration receipt", ({ scratch }) => {
  const result = cssPass(scratch, { ...CLIENT_TREE, ...UI_TREE });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.policies[0]?.owner.status).toBe("success");
  // The CONTROL that makes both refusals below a measurement: this overlay really does carry the finding.
  expect(result.authority.effectiveFindings).toHaveLength(1);
  expect(result.policies[0]?.receipts).toMatchObject([{ kind: "resource", unresolved: 0 }]);
});

test("a missing CLIENT source tree refuses at the population phase rather than reporting a clean zero", ({ scratch }) => {
  expect(refusalShape(cssPass(scratch, { ...UI_TREE }))).toMatchObject(REFUSAL);
});

test("a missing UI source tree refuses the same way — neither half of the derivation is privileged", ({ scratch }) => {
  expect(refusalShape(cssPass(scratch, { ...CLIENT_TREE }))).toMatchObject(REFUSAL);
});

// ---------------------------------------------------------------------------------------------------
// §4.2 ORDINARY MARKER IDENTITY AT THE PAREN-CARRYING COORDINATE (refutation-ledger row 532, #2158).
//
// The module's own `mustPass` row waives `#ff0000` — the paren-FREE case, which the #2107 carrier/coordinate
// split never touched. So the ONE property that split exists to create, that a paren-carrying value is
// waivable AT ALL, was pinned by no row in the module and no arm in this file: the `fix` string promises
// `oklch` and nothing asserted that the engine binds a marker written that way. This is that arm. It is the
// POSITIVE arm only — a negative arm under `knownPolicies: [gate]` rides the unknown-policy short-circuit and
// proves nothing (§4.2).
// ---------------------------------------------------------------------------------------------------
const PAREN_CARRYING = "packages/client/src/features/x/paren.css";
const PAREN_VALUE = ".brand {\n  color: oklch(0.5 0.2 30);\n}\n";

test("a paren-carrying value is waivable at its leading function name, which is the coordinate the policy reports", ({ scratch }) => {
  // The CONTROL first: unmarked, this fixture really does carry the finding, and the position the policy
  // reports really is the function name rather than the whole value.
  const unmarked = cssPass(scratch, { ...UI_TREE, [PAREN_CARRYING]: PAREN_VALUE });
  expect(unmarked.authority.effectiveFindings.map(({ token }) => token)).toEqual(["oklch"]);

  const waived = cssPass(scratch, {
    ...UI_TREE,
    [PAREN_CARRYING]: `.brand {\n  /* @orb-waive no-raw-color-in-css(oklch): the proof's stand-in reason and its end condition. */\n  color: oklch(0.5 0.2 30);\n}\n`,
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});
