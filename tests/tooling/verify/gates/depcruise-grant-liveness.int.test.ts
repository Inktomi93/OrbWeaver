// The PERMANENT PIN for the `depcruise-grant-liveness` policy, migrated to the final `defineGate` contract
// (#1930). The matcher/classifier and every self-proof arm (dead row, template-literal code-config,
// ambiguous-pattern skip, dependency-pattern liveness, the classifier-rot tripwire) are proven through the
// policy's own `mustFlag`/`mustPass` rows against `verifyPolicyProofs`, which the family conformance test
// `tests/tooling/verify/gates/grant-liveness-family.suite.test.ts` runs. (#1932 correction: this header used to
// cite `tests/tooling/verify/ops/policy-conformance.test.ts` as that harness. It is not — that file proves
// `verifyPolicyProofs` ITSELF against synthetic policies and imports no gate module, so until the family
// test landed, NO committed test executed this policy's proofs.) What THIS file keeps is
// what those isolated resource fixtures cannot show:
//   1. a MISSING or UNPARSEABLE `.dependency-cruiser.cjs` REFUSES the whole run as a population-phase TOOL
//      ERROR — the fail-LOUD requirement is now the runtime's own refusal (`resolveResourceDeclarations`
//      throws on a non-ready declared resource), which the final proof harness has no "expect a tool error"
//      arm to express;
//   2. the irreducible BACKREFERENCE budget is two-sided (unit-pinned directly — the arm is guarded by the
//      real-tree BUDGET_ANCHOR, which no resource proof carries).
//
// THE REAL-ROOT ARM IS BACK (#1947, 2026-09-11) — the full reconstruction is in the twin header at
// `eslint-grant-liveness.int.test.ts`. In short: the #1932 lane's measurement and diagnosis were right (the
// whole-inventory `native-config` population contains the tracked symlink `.codex/agent-doctrine.md`, which
// `ops/resource-reader.ts` refuses by design), but its RULING that no `native-config` policy can run at
// repository scope was a defect in `lib/policy-pass.ts`: it demanded an ordinary-waiver text carrier from
// EVERY completed owner, including HARD owners, which have no waiver door and can demand none. The old
// block's ASSERTION ("zero dead rows on the real tree") is not restored; real-tree finding correctness for
// a resource policy is the ORCHESTRATOR's `pnpm check:structure` floor. This file pins that the policy
// RESOLVES AND RUNS at repository scope.
//
// THE REAL-TREE VERDICT MOVED TO THE FRONT DOOR (#1584 mixed runtime, 2026-09-11) — the full reasoning is in
// the twin header at `eslint-grant-liveness.int.test.ts`. The `effectiveFindings` stopgap this arm carried
// while the production loader was legacy-only is deleted only because the transfer was PROVEN first: the mixed
// `pnpm check:structure` roster names `depcruise-grant-liveness` (contract final, owner success, population
// complete, 210 native-config rows + 9 package facts over 9,426 tracked files), and a dead file-exact
// `from.path` row planted in the real `.dependency-cruiser.cjs` was reported by the mixed run, then restored —
// receipt in the deleting commit. The runnability arms stay.
import { Project } from "ts-morph";
import { classifyRegex, gate } from "../../../../tooling/src/verify/gates/depcruise-grant-liveness.ts";
import { irreducibleBudgetFindings } from "../../../../tooling/src/verify/lib/grant-liveness.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

test("classifyRegex — the CONSERVATIVE direction (import law must never false-RED)", () => {
  for (const pattern of [
    "^packages/server/",
    "^packages/ui/src/(a|b)/",
    "^packages/client/src/features/[^/]+/.+$",
    "node_modules/(echarts|cmdk)/",
    String.raw`\.(test|spec)\.tsx?$`,
    "^packages/ui/src/live.ts",
  ]) {
    expect(classifyRegex(pattern)).toBeUndefined();
  }
  expect(classifyRegex(String.raw`^packages/ui/src/live\.ts$`)).toBe("packages/ui/src/live.ts");
});

test("the irreducible BUDGET is two-sided — growth AND an uncommitted shrink both RED", () => {
  const message = "actual {actual} budget {budget}";
  expect(irreducibleBudgetFindings(".dependency-cruiser.cjs", 15, 15, message)).toEqual([]);
  expect(irreducibleBudgetFindings(".dependency-cruiser.cjs", 16, 15, message)[0]?.message).toBe("actual 16 budget 15");
  expect(irreducibleBudgetFindings(".dependency-cruiser.cjs", 14, 15, message)[0]?.message).toBe("actual 14 budget 15");
});

test("a MISSING .dependency-cruiser.cjs refuses the whole run as a population-phase TOOL ERROR", ({ scratch }) => {
  const project = new Project({ useInMemoryFileSystem: true });
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: scratch, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toHaveLength(1);
  expect(result.toolErrors[0]).toMatchObject({ policyId: gate.id, phase: "population" });
  expect(result.toolErrors[0]?.message).toContain("is missing");
});

// The mechanism and its receipt live at `lib/policy-pass.ts#ordinaryWaiverAcquisition`.
// The real inventory read plus the native config load measures ~0.7s here (~4.0s for the ESLint twin), so
// this arm carries an explicit load-scaled budget rather than sitting one contention spike away from
// vitest's 5s default.
test("the REAL repository root: this hard policy resolves and runs to a receipted, successful owner", { timeout: scaledBudget(60_000) }, ({ repoRoot }) => {
  const project = new Project({ useInMemoryFileSystem: true });
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: repoRoot, project, reviewedGrants: [], failOnWarnings: false });

  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.owner).toMatchObject({ status: "success" });
  expect(result.policies[0]?.population.effectiveResourcePaths.length).toBeGreaterThan(1000);
  expect(result.policies[0]?.receipts.some(({ kind }) => kind === "resource")).toBe(true);
  // A hard policy has no waiver door, so its population demands no ordinary-waiver text carrier.
  expect(result.waiverCarrierRefusals).toEqual([]);
  // The real-tree VERDICT (zero effective findings) is no longer asserted here: the mixed front door runs this
  // policy on the real corpus on every `pnpm check:structure` and owns that verdict — see the header.
});
