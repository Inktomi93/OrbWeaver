// The PERMANENT PIN for the `depcruise-grant-liveness` policy, migrated to the final `defineGate` contract
// (#1930). The matcher/classifier and every self-proof arm (dead row, template-literal code-config,
// ambiguous-pattern skip, dependency-pattern liveness, the classifier-rot tripwire) are proven through the
// policy's own `mustFlag`/`mustPass` rows against `verifyPolicyProofs`, which the family conformance test
// `tests/tooling/verify/gates/grant-liveness-family.test.ts` runs. (#1932 correction: this header used to
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
// RETIRED, NOT SUCCEEDED — the old "REAL tree: zero dead rows" describe block (`{ repoRoot }` invoking the
// real policy over the actual `.dependency-cruiser.cjs`). `native-config`'s resolved resource population is
// the WHOLE tracked+untracked repository inventory (`lib/policy-repo-inventory.ts`'s `git ls-files` +
// `git ls-files --others`), not a scoped subset — so any policy declaring it fails population resolution at
// real-repo scope with "ordinary waiver resource population has no exact text carrier: <some .md/.css/.json
// file>" (`lib/policy-pass.ts` `ordinaryWaiverSources`): `resource-host.ts` supplies an ordinary-waiver TEXT
// CARRIER only for the resources it reads as text itself (authoredCss, staticConfig, …), never for the
// incidental thousands of unrelated files a native-config's inventory happens to include. This is a
// resource-host gap for the `native-config` kind, not a defect in this policy — `resource-*.ts` under
// `verify/ops/` is fenced from this lane; see the report for the FORK. MEASURED 2026-09-11 (#1932 lane):
// running this policy's sibling through `runPolicyPass` at the real repository root throws
// `ordinary waiver resource population has no exact text carrier: .codex/agent-doctrine.md` — the carrier
// is missing because that path is a tracked SYMLINK and `ops/resource-reader.ts` refuses symlink
// traversal by design, so the first trigger on this tree is symlink policy, not file format. Every other already-converted
// resource-analysis policy (`package-layout`, `ui-exports-map-complete`, `feature-structure`,
// `server-layout`, `no-raw-color-in-css`) likewise carries no bespoke real-root int test — real-tree
// correctness for a resource policy is the ORCHESTRATOR'S `pnpm check:structure` floor, not a lane unit test.
import { Project } from "ts-morph";
import { classifyRegex, gate } from "../../../../tooling/src/verify/gates/depcruise-grant-liveness.ts";
import { irreducibleBudgetFindings } from "../../../../tooling/src/verify/lib/grant-liveness.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

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
