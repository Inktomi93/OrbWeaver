// The standing conformance net for the `grant-liveness` FAMILY: every policy whose verdict is "does this
// config selector still name something this repository carries". The family shares two readers — the
// executable-config subject reader (`lib/config-snapshot.ts` `readConfigSnapshot`, reached only through the
// `native-config` ResourceHost fact) and the liveness/exemption reconciler
// (`lib/grant-liveness.ts` `livenessFindings` / `patternLivenessFindings`).
//
// `runner-config-path-liveness` JOINED 2026-09-12 (#1584): the `authored-path` door its 2026-09-11 refusal
// specified shipped inside the frozen 18-kind vocabulary, so the refusal's premise is retired and the module
// converted. It adds a third shared reader to the family — the authored-path IDENTITY door
// (`contract/resource-path.ts`), which answers containment and normalization for a selector read out of
// another resource.
//
// Two more members of that family are still LEGACY descriptors and therefore cannot appear here:
// `biome-grant-liveness` and `tsconfig-entry-liveness`. Each keeps its own permanent-pin int test until it
// converts; add it to `policies` below in the converting commit.
//
// WHY THIS FILE EXISTS (#1932): both converted policies' permanent-pin int tests previously cited
// `tests/tooling/verify/ops/policy-conformance.test.ts` as the harness that runs their `mustFlag`/`mustPass`
// rows. That file imports NO gate module — it proves `verifyPolicyProofs` itself against synthetic policies —
// so no committed test executed these policies' proofs, including depcruise's #973 pattern-liveness rows.
// `verifyPolicyProofs` runs each row through the production dispatcher (`runPolicyPass`), so an empty result
// is the receipt that every arm still fires on its own fixture.
import { gate as depcruiseGrantLiveness } from "../../../../tooling/src/verify/gates/depcruise-grant-liveness.ts";
import { gate as eslintGrantLiveness } from "../../../../tooling/src/verify/gates/eslint-grant-liveness.ts";
import { gate as runnerConfigPathLiveness } from "../../../../tooling/src/verify/gates/runner-config-path-liveness.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const policies = [depcruiseGrantLiveness, eslintGrantLiveness, runnerConfigPathLiveness] as const;

// Every row in this family is `mode: "resource"`: each one materialises a real temp repository and drives a
// NATIVE loader in a niced child (dependency-cruiser, ESLint's ConfigArray, Vitest's `resolveConfig`). That is
// seconds per row by construction, so the arm carries an explicit load-scaled budget instead of sitting one
// contention spike away from vitest's 5s default.
test("every grant-liveness policy's own proofs hold through the production dispatcher", { timeout: scaledBudget(180_000) }, () => {
  expect(verifyPolicyProofs(policies)).toEqual([]);
});

test("the family is one family, and its authority carries no suppression door", () => {
  // A `hard` policy has no waiver or reviewed-grant door, so there is no granted/stale-grant
  // reconciliation arm for these policies to drive (the shape `home-client-family.test.ts` uses for
  // `no-raw-matchmedia`). This row is the tripwire on that reasoning: flipping any of these to `ordinary`
  // or `reviewed-grant` adds a central authority surface that this family test would then owe a
  // `runPolicyPass` arm for.
  expect(policies.map((policy) => [policy.id, policy.family, policy.authority])).toEqual([
    ["depcruise-grant-liveness", "grant-liveness", "hard"],
    ["eslint-grant-liveness", "grant-liveness", "hard"],
    ["runner-config-path-liveness", "grant-liveness", "hard"],
  ]);
});
