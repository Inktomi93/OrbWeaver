// The §4.5 REFUSAL pins for the nine policies over the shared `ui-tier-permissions` fact — the
// `ui-z-index-tier`, `ui-skin-fragment-tier` and `ui-pointer-capability-tier` families (#0038).
//
// WHY THEY LIVE HERE AND NOT AS `mustRefuse` ROWS. The fact counts `ctx.files` and throws nothing, and every
// consumer's population sits inside the fact's (`@client`/`@ui`), so the one supply failure it can reach is
// a policy population that admits zero paths. The dispatcher refuses that at the POPULATION phase with its
// own generic sentence, which the refusal envelope (`lib/policy-refusal-envelope.ts`) rightly forbids a row
// from naming. What discriminates it is the refusal SHAPE — a population-phase tool error, the owner
// incomplete and withheld, no finding raw or effective — and that is a `runPolicyPass` assertion. Each pin is
// two-sided: the same run plus one admitted file reaches a verdict, so the refusal is caused by the empty
// population and not by the fixture. `z-index-tier-health` additionally declares the `tokens` JSON resource;
// that refusal is its own `mustRefuse` row, so both of its fixtures here carry the vault and isolate the
// population cause.
//
// The families' converted proof rows and grant behaviour stay in `tests/tooling/verify/lib/ui-tier-permissions.test.ts`.
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as pointerOutside } from "../../../../tooling/src/verify/gates/no-pointer-variants-in-features.ts";
import { gate as zOutside } from "../../../../tooling/src/verify/gates/no-raw-z-index.ts";
import { gate as pointerHealth } from "../../../../tooling/src/verify/gates/pointer-capability-tier-health.ts";
import { gate as pointerPermission } from "../../../../tooling/src/verify/gates/pointer-capability-tier-permission.ts";
import { gate as skinHealth } from "../../../../tooling/src/verify/gates/skin-fragment-tier-health.ts";
import { gate as skinPermission } from "../../../../tooling/src/verify/gates/skin-fragment-tier-permission.ts";
import { gate as skinOutside } from "../../../../tooling/src/verify/gates/ui-skin-fragment-purity.ts";
import { gate as zHealth } from "../../../../tooling/src/verify/gates/z-index-tier-health.ts";
import { gate as zPermission } from "../../../../tooling/src/verify/gates/z-index-tier-permission.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { Z_TOKEN_NAMES } from "../../../../tooling/src/verify/lib/ui-tier-permissions.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/ui-tier-refusal";
const ZERO_PATHS = "admitted zero paths";
/** Outside both `@client` and `@ui`, so every one of the nine populations admits nothing. */
const OUTSIDE = { "packages/server/src/x.ts": "export const x = 1;" };
const CLIENT = { "packages/client/src/features/demo/x.ts": "export const x = 1;" };
const UI = { "packages/ui/src/primitives/x.ts": "export const x = 1;" };
const TOKENS = { "packages/ui/src/tokens/tokens.json": `{"z":{${Z_TOKEN_NAMES.map((name) => `"${name}":{}`).join(",")}}}` };

function pass(policy: GatePolicy, files: Readonly<Record<string, string>>): PolicyPassResult {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    if (path.endsWith(".ts")) {
      project.createSourceFile(`${ROOT}/${path}`, source);
    }
  }
  return runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root: ROOT,
    project,
    resourceOptions: { overlay: files },
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

function refusalShape(result: PolicyPassResult): Record<string, unknown> {
  return {
    rawFindings: result.policies.flatMap(({ findings }) => findings),
    effectiveFindings: result.authority.effectiveFindings,
    toolErrors: result.toolErrors.map(({ policyId, phase, message }) => ({ policyId, phase, message })),
    owners: result.policies.map(({ id, owner }) => [id, owner.status]),
    withheld: result.authority.withheldPolicyIds,
  };
}

/** The nine consumers, iterated by value: the refusal-coverage recognizer follows a `for…of` binding to the
 *  iterated array, and a destructured `[policy, files]` head would hide the driven set from it. */
const POLICIES = [zOutside, zPermission, zHealth, skinOutside, skinPermission, skinHealth, pointerOutside, pointerPermission, pointerHealth];

/** The smallest overlay each population admits — the verdict half of the two-sided pin. */
function admitted(policy: GatePolicy): Readonly<Record<string, string>> {
  if (policy.id === zHealth.id) {
    return { ...UI, ...TOKENS };
  }
  return policy.population === "@ui" ? UI : CLIENT;
}

test("every ui-tier consumer refuses at the population phase when its population admits zero paths", () => {
  for (const policy of POLICIES) {
    const result = pass(policy, policy.id === zHealth.id ? { ...OUTSIDE, ...TOKENS } : OUTSIDE);
    expect(refusalShape(result)).toEqual({
      rawFindings: [],
      effectiveFindings: [],
      toolErrors: [{ policyId: policy.id, phase: "population", message: expect.stringContaining(ZERO_PATHS) }],
      owners: [[policy.id, "incomplete"]],
      withheld: [policy.id],
    });
  }
});

test("the same run with one admitted file reaches a verdict instead of refusing", () => {
  for (const policy of POLICIES) {
    const result = pass(policy, { ...OUTSIDE, ...admitted(policy) });
    expect(result.toolErrors, policy.id).toEqual([]);
    expect(result.factErrors, policy.id).toEqual([]);
    expect(
      result.policies.map(({ id, owner }) => [id, owner.status]),
      policy.id,
    ).toEqual([[policy.id, "success"]]);
  }
});
