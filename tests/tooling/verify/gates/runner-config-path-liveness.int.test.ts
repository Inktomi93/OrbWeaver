// The PERMANENT PIN for the `runner-config-path-liveness` policy, migrated to the final `defineGate`
// contract (#1584, 2026-09-12). The founding promise is unchanged: a FILE-EXACT path in a test-runner
// config's file-SELECTION lists whose file is GONE must be RED. It used to be invisible — no gate read the
// runner configs, and no RUNNER complains either (vitest silently drops a non-matching include/exclude
// entry), so `tests/tooling/ast-observability.int.test.ts`'s rename left its SERIAL_INT row matching NOTHING
// for months and the repo's heaviest file (17.6 min) ran in the PARALLEL lane (#1018 / #1012).
//
// The classifier and every liveness arm — dead row, containment (including the in-repo symlink that escapes
// the tree), the field-specific include-must-be-a-file rule, the named-const spread, the glob skips and the
// classifier-rot tripwire — are now the policy's own `mustFlag`/`mustPass` rows, run through the production
// dispatcher by `tests/tooling/verify/gates/grant-liveness-family.test.ts` and by the
// `structure:policy-conformance` stage. What THIS file keeps is what those isolated resource fixtures
// cannot express:
//   1. the three REFUSAL arms the conversion moved out of the policy — a MISSING, an UNPARSEABLE and an
//      UNREADABLE-SHAPE runner config now refuse the whole run as a population-phase TOOL ERROR
//      (`resolveResourceDeclarations` throws on a non-ready declared resource), and the proof harness has no
//      "expect a tool error" arm (guide §4.5b). The fail-LOUD requirement is the runtime's refusal now, so
//      this is where it is pinned;
//   2. that the policy RESOLVES AND RUNS at repository scope against the three real configs — the
//      `depcruise-grant-liveness` / `eslint-grant-liveness` shape. The real-tree VERDICT (zero effective
//      findings) belongs to the mixed front door, which runs this policy on the real corpus on every
//      `pnpm check:structure`.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/runner-config-path-liveness.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const VITEST_REL = "vitest.config.ts";
const E2E_REL = "playwright.config.ts";
const CT_REL = "playwright-ct.config.ts";
const CT_SOURCE = 'export default { testDir: "tests", testMatch: "**/*.ct.tsx" };\n';

function plant(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

/** A `native-config` declaration observes the whole authored transaction, which Git owns — so a root that
 *  reaches the Vitest snapshot at all must be a repository. The conformance runner does the same for every
 *  `mode: "resource"` row; here it is explicit because these arms drive `runPolicyPass` directly. */
function plantRepository(root: string, files: Readonly<Record<string, string>>): void {
  for (const [rel, content] of Object.entries(files)) {
    plant(root, rel, content);
  }
  for (const args of [
    ["init", "--quiet"],
    ["add", "--all"],
  ]) {
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: root, stdio: "pipe" });
  }
}

function runAt(root: string): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  return runPolicyPass({ knownPolicies: [gate], policies: [gate], root, project, reviewedGrants: [], failOnWarnings: false });
}

test("a MISSING runner config refuses the whole run as a population-phase TOOL ERROR", ({ scratch }) => {
  const result = runAt(scratch);
  expect(result.toolErrors).toHaveLength(1);
  expect(result.toolErrors[0]).toMatchObject({ policyId: gate.id, phase: "population" });
  expect(result.toolErrors[0]?.message).toContain("is missing");
});

test("an UNPARSEABLE runner config FAILS LOUD — no silent default-fallback", { timeout: scaledBudget(60_000) }, ({ scratch }) => {
  plantRepository(scratch, {
    [VITEST_REL]: 'export default { test: { include: ["tests/a.test.ts"] } };\n',
    [E2E_REL]: "export default { testDir: [ ;;; (((( };\n",
    [CT_REL]: CT_SOURCE,
  });
  const result = runAt(scratch);
  expect(result.toolErrors[0]).toMatchObject({ policyId: gate.id, phase: "population" });
  expect(result.toolErrors[0]?.message).toContain("did not parse");
});

test("an UNREADABLE shape REFUSES rather than being silently skipped", { timeout: scaledBudget(60_000) }, ({ scratch }) => {
  plantRepository(scratch, {
    [VITEST_REL]: 'export default { test: { include: ["tests/a.test.ts"] } };\n',
    [E2E_REL]: "export default { testDir: resolveDir() };\n",
    [CT_REL]: CT_SOURCE,
  });
  const result = runAt(scratch);
  expect(result.toolErrors[0]).toMatchObject({ policyId: gate.id, phase: "population" });
  expect(result.toolErrors[0]?.message).toContain("unreadable");
});

// The three real configs plus the whole tracked inventory; the Vitest snapshot runs Vitest's own
// `resolveConfig` in a niced child, so this arm carries an explicit load-scaled budget rather than sitting
// one contention spike away from vitest's 5s default.
test("the REAL repository root: this hard policy resolves and runs to a receipted, successful owner", { timeout: scaledBudget(120_000) }, ({ repoRoot }) => {
  const result = runAt(repoRoot);

  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.owner).toMatchObject({ status: "success" });
  // THE DENOMINATOR IS THE RECEIPT: kind globs hide behind imports and calls, so a thin resource population
  // would mean the reader went blind even though the verdict looks green.
  expect(result.policies[0]?.population.effectiveResourcePaths.length).toBeGreaterThan(1000);
  expect(result.policies[0]?.receipts.some(({ kind }) => kind === "resource")).toBe(true);
  // A hard policy has no waiver door, so its population demands no ordinary-waiver text carrier — which is
  // what made a `native-config` consumer unrunnable at repository scope before #1947.
  expect(result.waiverCarrierRefusals).toEqual([]);
});
