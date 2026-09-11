// The PERMANENT PIN for the `eslint-grant-liveness` policy, migrated to the final `defineGate` contract
// (#1930). Every native-population shape (a dead file selector, a local ignore with no member inside its
// parent scope, both live twins) is proven through the policy's own `mustFlag`/`mustPass` rows against
// `verifyPolicyProofs`, which the family conformance test
// `tests/tooling/verify/gates/grant-liveness-family.test.ts` runs. (#1932 correction: this header used to
// cite `tests/tooling/verify/ops/policy-conformance.test.ts` as that harness. It is not — that file proves
// `verifyPolicyProofs` ITSELF against synthetic policies and imports no gate module, so until the family
// test landed, NO committed test executed this policy's proofs.)
// What THIS file keeps is what those isolated resource fixtures cannot show: a MISSING or malformed
// `eslint.config.js` REFUSES the whole run as a population-phase TOOL ERROR — the fail-LOUD requirement is
// now the runtime's own refusal (`resolveResourceDeclarations` throws on a non-ready declared resource),
// which the final proof harness has no "expect a tool error" arm to express.
//
// THE REAL-ROOT ARM IS BACK (#1947, 2026-09-11). The #1932 lane retired it and recorded the retirement as
// a law about this policy: `native-config`'s resolved resource population is the WHOLE tracked+untracked
// repository inventory (`lib/policy-repo-inventory.ts`), one member of which is the tracked SYMLINK
// `.codex/agent-doctrine.md` that `ops/resource-reader.ts` refuses by design — so `runPolicyPass` at the
// real root threw `ordinary waiver resource population has no exact text carrier: .codex/agent-doctrine.md`
// after ~4.2s and the plan classified exit 2. The MEASUREMENT was right and the DIAGNOSIS was right; the
// RULING ("no `native-config` policy can run at repository scope") was a defect in `lib/policy-pass.ts`,
// which demanded an ordinary-waiver text carrier from EVERY completed owner's resource population. A HARD
// policy has no waiver door, so it can demand none. The whole-inventory observation window stays exactly as
// `ops/resource-native-config.ts` declares it. The old test's ASSERTION ("only the five ratified zero
// populations") is NOT restored here: real-tree finding correctness for a resource policy is the
// ORCHESTRATOR's `pnpm check:structure` floor. What this file pins is that the policy RESOLVES AND RUNS at
// repository scope at all — the exact thing that was dead.
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/eslint-grant-liveness.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

test("a MISSING eslint.config.js refuses the whole run as a population-phase TOOL ERROR", ({ scratch }) => {
  const project = new Project({ useInMemoryFileSystem: true });
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: scratch, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toHaveLength(1);
  expect(result.toolErrors[0]).toMatchObject({ policyId: gate.id, phase: "population" });
  expect(result.toolErrors[0]?.message).toContain("is missing");
});

// The mechanism and its receipt live at `lib/policy-pass.ts#ordinaryWaiverAcquisition`.
// The real inventory read plus the native ESLint config load measures ~4.0s on a quiet box, so this arm carries an
// explicit load-scaled budget rather than sitting one contention spike away from vitest's 5s default.
test("the REAL repository root: this hard policy resolves and runs to a receipted, successful owner", { timeout: scaledBudget(60_000) }, ({ repoRoot }) => {
  const project = new Project({ useInMemoryFileSystem: true });
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: repoRoot, project, reviewedGrants: [], failOnWarnings: false });

  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.owner).toMatchObject({ status: "success" });
  // The population IS the whole authored transaction; a scoped subset here would mean the deliberate
  // `resource-native-config.ts` observation window had silently narrowed.
  expect(result.policies[0]?.population.effectiveResourcePaths.length).toBeGreaterThan(1000);
  expect(result.policies[0]?.receipts.some(({ kind }) => kind === "resource")).toBe(true);
  // A hard policy has no waiver door, so its population demands no ordinary-waiver text carrier.
  expect(result.waiverCarrierRefusals).toEqual([]);
  // AND the real-tree verdict, which only this arm can take while the production loader is still legacy
  // (`pnpm check:structure` is RED by construction until the #1584 cutover): every ratified zero-member
  // selector still resolves and every cited path is still tracked.
  expect(result.authority.effectiveFindings).toEqual([]);
});
