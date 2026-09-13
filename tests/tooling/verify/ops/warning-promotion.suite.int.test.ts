// THE WARNING-PROMOTION DOOR, both sides (#2025; docs/design/gate-runtime-standardization.md §5).
//
// Owner ruling 2026-09-13: a final `severity: "warning"` finding stays GENUINELY NON-BLOCKING, with OPT-IN
// promotion to error. The mechanism has always been there — `lib/gate-authority.ts`'s
// `blocking: errors + alarmErrors + (failOnWarnings ? warnings : 0)` — but no shipped command could set the
// flag: both real-tree entrypoints hardcoded `false` and `planPolicyArgv` (which parses
// `--fail-on-warnings`) is reached by no `cli.ts` verb. `--fail-on-warnings` on `structure` and `scoped` is
// that door.
//
// WHY BOTH DIRECTIONS ARE ASSERTED, ALWAYS. The OFF arm is the CURRENT behaviour, so a suite that only
// asserted the ON arm would pass just as green against a build that ignored the flag and promoted
// unconditionally — which is the one outcome the ruling forbids (it would move the commit bar for the whole
// repo). The OFF arm is therefore the load-bearing half, and the third assertion — that the two runs report
// the IDENTICAL finding list — is what says the flag moves the VERDICT and never what was found.
//
// THE SUBJECT IS THE DOOR, so the policy is planted rather than shimmed: a minimal `defineGate` warning
// policy that reports exactly one finding on one planted file, beside the legacy control gate from
// structure.int.test.ts (so neither side is empty and the legacy total stays 0 — the promoted `1` can only
// have come from the final side). The real tree's own warning policies are proven by their family tests and
// by `check:policy-conformance`; what is unproven until here is the OPERATOR'S REACH.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { FinalPolicyRow, StructurePolicyReport, StructureReport } from "../../../../tooling/src/verify/contract/structure-report.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

/** A spawned run over a planted root loads the harness Project and both dispatchers: ~3-6 s quiet. */
const RUN_TIMEOUT_MS = scaledBudget(120_000);

const GATES = "tooling/src/verify/gates";
const POLICY_ID = "planted-warning";
const LEGACY_ID = "planted-ok";
/** The one file the planted policy reports on — every other source file in the tree is silent. */
const SUBJECT = "packages/client/src/features/probe/warned.ts";
const SUBJECT_LINE = "export const warned = 1;\n";
/** `warned` starts at column 14 of SUBJECT_LINE. The central ordinary-waiver engine checks that an ORDINARY
 *  finding's `token` is the EXACT slice at its reported position and raises an `ordinary-waiver` AUTHORITY
 *  ALARM when it is not — and an alarm is UNCONDITIONALLY blocking, which would make even the unpromoted arm
 *  exit 1 and silently destroy this suite's two-sidedness. Measured here red-first on 2026-09-12. */
const SUBJECT_COLUMN = 14;
const SUBJECT_TOKEN = "warned";
const QUIET = "packages/client/src/features/probe/quiet.ts";
const QUIET_LINE = "export const quiet = 1;\n";
const MESSAGE = "planted warning debt — the fixture finding the promotion door is proven against";
const FIX = "delete the planted subject, or waive it with `@orb-waive planted-warning(<position>): <reason>`";

/** A minimal, VALID final policy declaring `severity: "warning"` + its `workItem`, importing the REAL
 *  `defineGate` by absolute file URL (the loader refuses an unbranded lookalike, so the object this run
 *  judges is branded by the production contract). */
function plantedWarningPolicy(repoRoot: string): string {
  const contract = JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/contract/policy.ts")).href);
  return [
    `import { defineGate } from ${contract};`,
    "",
    "export const gate = defineGate({",
    `  id: ${JSON.stringify(POLICY_ID)},`,
    `  family: ${JSON.stringify(POLICY_ID)},`,
    '  authority: "ordinary",',
    '  severity: "warning",',
    "  workItem: 2025,",
    '  population: { of: "all", why: "the planted tree is this fixture policy\'s whole world" },',
    '  analysis: "syntax",',
    '  execution: "selected-files",',
    "  facts: [],",
    "  resources: [],",
    `  message: ${JSON.stringify(MESSAGE)},`,
    `  fix: ${JSON.stringify(FIX)},`,
    "  create: (ctx) => ({",
    "    visitFile: (sourceFile) => {",
    "      const path = ctx.relativePath(sourceFile);",
    `      if (path === ${JSON.stringify(SUBJECT)}) {`,
    `        ctx.report.file(path, { line: 1, column: ${SUBJECT_COLUMN}, token: ${JSON.stringify(SUBJECT_TOKEN)} });`,
    "      }",
    "    },",
    "  }),",
    `  mustFlag: [{ mode: "source", files: { ${JSON.stringify(SUBJECT)}: ${JSON.stringify(SUBJECT_LINE)} }, expect: { count: 1, line: 1, token: ${JSON.stringify(SUBJECT_TOKEN)} }, why: "the planted subject is the one file this fixture policy reports" }],`,
    `  mustPass: [{ mode: "source", files: { ${JSON.stringify(QUIET)}: ${JSON.stringify(QUIET_LINE)} }, why: "every other source file is silent" }],`,
    "});",
    "",
  ].join("\n");
}

/** The legacy control (structure.int.test.ts's shape): scans everything, flags nothing. It keeps the legacy
 *  side non-empty and its total at 0, so `report.total` on the promoted run is unambiguously the final side's. */
const LEGACY_GATE = `export const gate = {
  name: ${JSON.stringify(LEGACY_ID)},
  docRow: "Core-Enforcement-Active-Gates.md",
  status: "active",
  scopeSafety: "incremental-safe",
  message: "the planted control gate — it flags nothing",
  scanRoot: () => true,
  visitFile: () => undefined,
  mustFlag: [{ files: "export const a = 1;\\n" }],
  mustPass: [{ files: "export const b = 1;\\n" }],
};
`;

function plantedTreeFiles(repoRoot: string): Readonly<Record<string, string>> {
  return {
    [`${GATES}/${POLICY_ID}.ts`]: plantedWarningPolicy(repoRoot),
    [`${GATES}/${LEGACY_ID}.ts`]: LEGACY_GATE,
    [SUBJECT]: SUBJECT_LINE,
    [QUIET]: QUIET_LINE,
  };
}

function readArtifact(root: string): StructureReport {
  return JSON.parse(readFileSync(join(root, "reports", "check-structure.json"), "utf8")) as StructureReport;
}

function policyOf(report: StructureReport): StructurePolicyReport {
  if (report.policy === null) {
    throw new Error("the artifact carries no final-side block");
  }
  return report.policy;
}

function warningRow(report: StructureReport): FinalPolicyRow {
  const row = report.gates.find((gate) => gate.name === POLICY_ID);
  if (row === undefined || row.contract !== "final") {
    throw new Error(`no final row for ${POLICY_ID} in ${report.gates.map((gate) => gate.name).join(", ")}`);
  }
  return row;
}

test("structure: a warning finding blocks NOTHING by default and blocks with --fail-on-warnings, and the flag moves only the verdict", {
  timeout: RUN_TIMEOUT_MS * 2,
}, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await plantedTree(plantedTreeFiles(repoRoot));

  // ── OFF (the shipped default, unchanged): reported, counted, blocking nothing ──
  const off = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(off).toExitWith(0);
  const offReport = readArtifact(root);
  expect(policyOf(offReport).authority.verdict).toEqual({ errors: 0, warnings: 1, blocking: 0, failOnWarnings: false });
  expect(offReport.total).toBe(0);
  expect(offReport.ok).toBe(true);
  // the row still SAYS it found something — non-blocking is not invisible
  expect(warningRow(offReport)).toMatchObject({ severity: "warning", workItem: 2025, withheld: false, waived: 0 });
  expect(warningRow(offReport).violations).toEqual([
    { file: SUBJECT, line: 1, column: SUBJECT_COLUMN, token: SUBJECT_TOKEN, severity: "warning", message: MESSAGE },
  ]);

  // ── ON (the opt-in): the SAME finding, now blocking — a VIOLATION (exit 1), never a tool error (exit 2) ──
  const on = await runCli("verify", ["structure", "--fail-on-warnings"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(on).toExitWith(1);
  const onReport = readArtifact(root);
  expect(policyOf(onReport).authority.verdict).toEqual({ errors: 0, warnings: 1, blocking: 1, failOnWarnings: true });
  expect(onReport.total).toBe(1);
  expect(onReport.ok).toBe(false);
  // no tool error on either side: the promoted warning is a verdict about the TREE, not about the checker
  expect(policyOf(onReport).toolErrors).toEqual([]);
  expect(policyOf(onReport).authority.toolErrors).toEqual([]);
  expect(policyOf(onReport).authority.alarms).toEqual([]);
  expect(onReport.toolErrors).toEqual([]);

  // ── the flag moves the VERDICT and nothing else: identical findings, identical legacy side ──
  expect(warningRow(onReport).violations).toEqual(warningRow(offReport).violations);
  expect(onReport.gates.map((gate) => `${gate.contract}:${gate.name}`)).toEqual(offReport.gates.map((gate) => `${gate.contract}:${gate.name}`));
  expect(onReport.run.final).toEqual(offReport.run.final);
  expect(onReport.run.legacy).toEqual(offReport.run.legacy);
});

test("structure refuses an unknown tail BEFORE it opens a run slot, so a typo leaves no artifact at all", { timeout: RUN_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree(plantedTreeFiles(repoRoot));
  const typo = await runCli("verify", ["structure", "--fail-on-warning"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(typo).toExitWith(3);
  expect(typo.stderr).toContain("structure takes at most --fail-on-warnings");
  // #1117's whole point: the near-miss must not run the OTHER verdict. Nothing was written, in-flight or not.
  expect(existsSync(join(root, "reports"))).toBe(false);

  // and the flag twice is misuse too — the grammar is zero or one
  const twice = await runCli("verify", ["structure", "--fail-on-warnings", "--fail-on-warnings"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(twice).toExitWith(3);
  expect(existsSync(join(root, "reports"))).toBe(false);
});

test("scoped: the same opt-in, the same default — a warning is exit 0 without the flag and exit 1 with it", { timeout: RUN_TIMEOUT_MS * 2 }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree(plantedTreeFiles(repoRoot));
  const scope = ["scoped", "--scope", "packages/client"];

  const off = await runCli("verify", scope, { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(off).toExitWith(0);
  expect(off.stdout).toContain(SUBJECT);

  const on = await runCli("verify", [...scope, "--fail-on-warnings"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(on).toExitWith(1);
  // the finding is the same one; only the verdict moved
  expect(on.stdout).toContain(SUBJECT);
});
