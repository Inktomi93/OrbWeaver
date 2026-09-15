// THE CORPUS PROOF (docs/design/gate-runtime-standardization.md §1) at the production door: `cli.ts structure`
// spawned over planted roots whose gates dir holds real policies as RE-EXPORT SHIMS
// (`baseui-render-prop-composition` ordinary, `no-raw-matchmedia` reviewed-grant, `verify-registry-parity`
// hard/resource). A shim imports the real module by absolute file URL, so the object the door runs IS the
// production descriptor (the loader's identity law refuses a copy, proven in lib/loader.test.ts) and the shim's
// basename is the id (the filename law).
//
// IT WAS THE MIXED-CORPUS PROOF UNTIL #2176 PHASE F (2026-09-14), and its legacy half is gone with the runtime
// it proved. The #2052 repair that half carried — MATERIALIZE the premise rather than borrowing a live gate
// that a conversion could retire underneath you — is the lesson that outlived it, and it is why every fixture
// below still plants what it asserts about instead of shimming a corpus member for its SHAPE. The two arms
// whose whole subject was the legacy side (its `@orb-gate-ignore` door and the `legacy:`/`final:` roster split)
// retired with it; the marker-ROUTING claim survives in the `@orb-waive` arm, where the "unknown policy" alarm
// is now proven against an id that names nothing at all, which is the honest general case.
//
// Every arm reads the ONE artifact (`reports/check-structure.json`) and the exit code the reader meets, never an
// in-process shortcut. The routing arms plant a marker on the WRONG side and assert the reconciliation finding —
// silence would be the defect.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { POLICY_PHASES } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import type { FinalPolicyRow, StructurePolicyReport, StructureReport } from "../../../../tooling/src/verify/contract/structure-report.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const GATES = "tooling/src/verify/gates";
/** A spawned mixed run over a planted root loads the harness Project and both dispatchers: ~3-6 s quiet. */
const RUN_TIMEOUT_MS = scaledBudget(120_000);

/** An id that names NOTHING in any corpus — the subject of the unknown-policy waiver alarm below. `probe-`
 *  marks it as this suite's own fixture rather than a corpus member anyone could mistake for a real gate. */
const ABSENT_POLICY = "probe-no-such-policy";
const ORDINARY = "baseui-render-prop-composition";
const REVIEWED = "no-raw-matchmedia";
const HARD_RESOURCE = "verify-registry-parity";
const WARNING = "over-art-plate-arm";

function shim(repoRoot: string, id: string): string {
  return `export { gate } from ${JSON.stringify(pathToFileURL(join(repoRoot, GATES, `${id}.ts`)).href)};\n`;
}

// The ordinary subject: the Radix spelling on a Base UI part, under the @ui population root.
const UI_MENU = "packages/ui/src/primitives/probe/menu.tsx";
const AS_CHILD_LINE = "export const G = <Menu.Trigger asChild />;\n";
/** The reviewed-grant subject: a raw matchMedia read — at a NON-subject path it is effective, at a real grant
 *  row's subject it is granted. The five real rows are in lib/reviewed-grants.ts. */
const GRANT_SUBJECT = "packages/ui/src/lib/coarse-pointer-now.ts";
const STRAY_READ = "packages/client/src/features/probe/x.tsx";
const CLIENT_STRAY_FILE = "packages/client/src/features/probe/y.ts";
const MATCH_MEDIA_LINE = 'export const G = (): unknown => globalThis.matchMedia("(prefers-reduced-motion: reduce)");\n';
const PLATELESS_COMPOSER =
  'html[data-blur-composer] [data-slot="composer"] {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, transparent);\n}\n';

function readArtifact(root: string): StructureReport {
  return JSON.parse(readFileSync(join(root, "reports", "check-structure.json"), "utf8")) as StructureReport;
}

function rowOf(report: StructureReport, name: string): FinalPolicyRow {
  const row = report.gates.find((g) => g.name === name);
  if (row === undefined) {
    throw new Error(`no row for ${name} in ${report.gates.map((g) => g.name).join(", ")}`);
  }
  return row;
}

/** `rowOf` already returns the artifact's ONE row shape (#2176 Phase F collapsed the roster to policies), so
 *  this is a readability alias rather than a narrowing. It is kept because the arms below say `finalRow` to
 *  mean "read this row in the policy vocabulary", which is the distinction the file is about. */
const finalRow = rowOf;

/** The dispatcher's aggregate, which every planted tree here has (a null block means no policy loaded at all). */
function policyOf(report: StructureReport): StructurePolicyReport {
  if (report.policy === null) {
    throw new Error("the artifact carries no final-side block");
  }
  return report.policy;
}

const mixedTree = (repoRoot: string, files: Readonly<Record<string, string>>): Readonly<Record<string, string>> => ({
  [`${GATES}/${ORDINARY}.ts`]: shim(repoRoot, ORDINARY),
  [`${GATES}/${REVIEWED}.ts`]: shim(repoRoot, REVIEWED),
  ...files,
});

// ── 1-4. both contracts execute in ONE invocation, contribute to ONE report, distinguishable per contract ─────

test("one invocation runs the whole roster into one artifact, each row in the contract's vocabulary", { timeout: RUN_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree(mixedTree(repoRoot, { [UI_MENU]: AS_CHILD_LINE, [STRAY_READ]: MATCH_MEDIA_LINE }));
  const res = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  // violations, no tool error: exit 1, one artifact, one completeness line naming the roster it ran
  await expect(res).toExitWith(1);
  expect(res.stdout).toContain("ran 2/2 registered gate(s) (2/2 policies)");
  const report = readArtifact(root);
  expect(report.run).toMatchObject({
    complete: true,
    corpusFiles: 2,
    registered: 2,
    active: 2,
    ran: 2,
    final: { registered: 2, ran: 2, withheld: 0 },
  });
  expect(report.gates.map((g) => `${g.contract}:${g.name}`)).toEqual([`final:${ORDINARY}`, `final:${REVIEWED}`]);

  // the rows: authority/severity/owner/population counts/receipts/POLICY_PHASES timing, severity-stamped findings
  const ordinary = finalRow(report, ORDINARY);
  expect(ordinary).toMatchObject({
    authority: "ordinary",
    severity: "error",
    family: ORDINARY,
    workItem: null,
    ok: false,
    withheld: false,
    waived: 0,
    granted: 0,
  });
  expect(ordinary.owner).toEqual({ status: "success", population: "complete" });
  expect(ordinary.population.effectiveSourcePaths).toBeGreaterThan(0);
  expect(ordinary.population.requestedPaths).toBeNull();
  expect(ordinary.violations).toEqual([
    { file: UI_MENU, line: 1, column: 32, token: "asChild", severity: "error", message: expect.stringContaining("Radix's composition idiom") },
  ]);
  expect(Object.keys(ordinary.timing.phaseMs).toSorted()).toEqual([...POLICY_PHASES].toSorted());
  const reviewed = finalRow(report, REVIEWED);
  expect(reviewed).toMatchObject({ authority: "reviewed-grant", severity: "error", ok: false, withheld: false, granted: 0 });
  expect(reviewed.violations.map((v) => v.file)).toEqual([STRAY_READ]);
  // the final aggregate: no refusals; the five real grant rows are STALE after a complete owner run (this tree holds
  // none of their subjects) — an alarm each, which is how a grant that reaches nothing stays loud
  expect(report.policy).not.toBeNull();
  expect(policyOf(report).authority.toolErrors).toEqual([]);
  expect(policyOf(report).factErrors).toEqual([]);
  expect(policyOf(report).toolErrors).toEqual([]);
  expect(policyOf(report).authority.alarms.map((a) => a.kind)).toEqual(Array.from({ length: 5 }, () => "stale-reviewed-grant"));
  expect(policyOf(report).authority.verdict).toEqual({ errors: 2 + 5, warnings: 0, blocking: 7, failOnWarnings: false });
  // total = the blocking count the authority verdict produced; ok false
  expect(report.total).toBe(7);
  expect(report.ok).toBe(false);
});

test("the artifact and both readers reconcile effective findings, warnings, and authority alarms", { timeout: RUN_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree({
    ...mixedTree(repoRoot, {
      [UI_MENU]: AS_CHILD_LINE,
      [STRAY_READ]: MATCH_MEDIA_LINE,
      "packages/client/src/styles/probe.css": PLATELESS_COMPOSER,
      "packages/ui/src/styles/keep.css": ".keep { color: var(--color-foreground); }\n",
    }),
    [`${GATES}/${WARNING}.ts`]: shim(repoRoot, WARNING),
  });

  const run = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(run).toExitWith(1);
  const report = readArtifact(root);
  const finalEffective = report.gates.reduce((count, row) => count + row.violations.length, 0);
  const warnings = policyOf(report).authority.verdict.warnings;
  const alarms = policyOf(report).authority.alarms.length;

  expect(warnings).toBeGreaterThan(0);
  expect(alarms).toBeGreaterThan(0);
  expect(report.reconciliation).toEqual({
    finalEffectiveFindings: finalEffective,
    nonblockingWarnings: warnings,
    authorityAlarms: alarms,
    blocking: report.total,
  });
  const equation = `${report.total} blocking = ${finalEffective} effective - ${warnings} nonblocking warning(s) + ${alarms} authority alarm(s)`;
  expect(run.stdout).toContain(equation);

  const shown = await runCli("verify", ["show", "--errors-only"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(shown).toExitWith(1);
  expect(shown.stdout).toContain(equation);
});

// ── 5-7. routing: @orb-waive → an ordinary policy only; grants → a reviewed-grant policy only ────────────────
//
// The third routing arm — `@orb-gate-ignore` reaching only its legacy owner — retired with the suppressor at
// #2176 Phase F. Its successor is not a second arm here: a final policy has NO inline door at all, which the
// authority declaration itself carries, and `gate-ignore-inventory` reds every residual marker on the tree.

test("@orb-waive reaches only a final ORDINARY policy: it waives there, alarms as unknown on an id nobody registers and as wrong-authority on a reviewed-grant policy", {
  timeout: RUN_TIMEOUT_MS,
}, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await plantedTree(
    mixedTree(repoRoot, {
      // the central door on a final ordinary finding, at the reported position: waived
      [UI_MENU]: `// @orb-waive ${ORDINARY}(asChild): planted — the central door on an ordinary finding\n${AS_CHILD_LINE}`,
      // the central door naming an id NOBODY REGISTERS: the engine reports it rather than absorbing it.
      // DECLARED LIMIT (the engine's marker universe, not the door): the dispatcher acquires carriers only from
      // its policies' effective populations, and this planted roster covers @client/@ui only — on the real tree
      // every authored TS/TSX path sits inside some population. The carrier below is inside one, deliberately.
      [CLIENT_STRAY_FILE]: `// @orb-waive ${ABSENT_POLICY}(cache): planted — names a policy the corpus does not hold\nexport const y = 1;\n`,
      // the central door naming a REVIEWED-GRANT policy: no waiver door there — wrong authority
      [STRAY_READ]: `// @orb-waive ${REVIEWED}(matchMedia): planted — a waiver on a reviewed-grant finding\n${MATCH_MEDIA_LINE}`,
    }),
  );
  const res = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(res).toExitWith(1);
  const report = readArtifact(root);
  const ordinary = finalRow(report, ORDINARY);
  expect(ordinary.violations).toEqual([]);
  expect(ordinary.waived).toBe(1);
  expect(ordinary.ok).toBe(true);
  // the reviewed-grant finding survives its foreign marker
  expect(finalRow(report, REVIEWED).violations).toHaveLength(1);
  const alarms = policyOf(report).authority.alarms;
  expect(alarms).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "ordinary-waiver",
        policyId: ABSENT_POLICY,
        message: expect.stringContaining(`targets unknown policy ${ABSENT_POLICY}`),
      }),
      expect.objectContaining({ kind: "ordinary-waiver", policyId: REVIEWED, message: expect.stringContaining(`targets non-ordinary policy ${REVIEWED}`) }),
    ]),
  );
});

test("a reviewed grant reaches only a final reviewed-grant policy: the real row's subject is granted, the other real rows stay stale", {
  timeout: RUN_TIMEOUT_MS,
}, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await plantedTree(mixedTree(repoRoot, { [GRANT_SUBJECT]: MATCH_MEDIA_LINE }));
  const res = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(res).toExitWith(1);
  const report = readArtifact(root);
  const reviewed = finalRow(report, REVIEWED);
  expect(reviewed.violations).toEqual([]);
  expect(reviewed.granted).toBe(1);
  expect(policyOf(report).authority.reviewedGrantConsumption.find(({ id }) => id === "no-raw-matchmedia:coarse-pointer-now")?.count).toBe(1);
  // the four rows whose subjects this tree does not hold are STALE — loud, never silently forgiven
  const stale = policyOf(report).authority.alarms.filter((a) => a.kind === "stale-reviewed-grant");
  expect(stale.map((a) => a.grantId).toSorted()).toEqual([
    "no-raw-matchmedia:media-grid",
    "no-raw-matchmedia:reduced-motion-now",
    "no-raw-matchmedia:use-is-mobile-viewport",
    "no-raw-matchmedia:use-prefers-reduced-motion",
  ]);
  // and the door hands the pass ONLY rows naming a loaded policy: no invalid-grant error for the rest of the table
  expect(policyOf(report).authority.toolErrors).toEqual([]);
});

// ── 8-9. the loader's refusals at the door ─────────────────────────────────────────────────────────────────

test("an unbranded lookalike in the corpus is a load refusal (exit 2, the in-flight stub), naming the module and the reason", {
  timeout: RUN_TIMEOUT_MS,
}, async ({ plantedTree, repoRoot, runCli }) => {
  const contract = pathToFileURL(join(repoRoot, "tooling/src/verify/contract/policy.ts")).href;
  const root = await plantedTree(
    mixedTree(repoRoot, {
      [`${GATES}/spread-copy.ts`]: `import { defineGate } from ${JSON.stringify(contract)};\nimport { gate as real } from ${JSON.stringify(pathToFileURL(join(repoRoot, GATES, `${ORDINARY}.ts`)).href)};\nvoid defineGate;\nexport const gate = { ...real, id: "spread-copy", family: "spread-copy" };\n`,
    }),
  );
  const res = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(res).toExitWith(2);
  expect(res.stderr).toContain(
    "gate module tooling/src/verify/gates/spread-copy.ts: `gate` has the policy contract's shape but was not created through defineGate",
  );
  expect(res.stderr).toContain("a spread, clone or copy loses the brand");
  // the load never got far enough to write a report — the stub survives, and it says so
  const slots = readdirSync(join(root, "reports", "runs", "structure"));
  expect(slots).toHaveLength(1);
  const stub = JSON.parse(readFileSync(join(root, "reports", "runs", "structure", slots[0] ?? "", "check-structure.json"), "utf8")) as StructureReport;
  expect(stub.run.complete).toBe(false);
  expect(existsSync(join(root, "reports", "check-structure.json"))).toBe(false);
});

test("a duplicate policy id across two modules is a load refusal naming both paths", { timeout: RUN_TIMEOUT_MS }, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await plantedTree(mixedTree(repoRoot, { [`${GATES}/aaa-twin.ts`]: shim(repoRoot, ORDINARY) }));
  const res = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(res).toExitWith(2);
  expect(res.stderr).toContain(`duplicate gate policy id ${ORDINARY}: tooling/src/verify/gates/aaa-twin.ts, tooling/src/verify/gates/${ORDINARY}.ts`);
});

// ── 10. one failed owner withholds only its own authority reconciliation, with explicit failure state ────────

test("a resource policy whose resource is missing is withheld with explicit failure state while its siblings reconcile", { timeout: RUN_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  // no package.json in this root: verify-registry-parity's `package-metadata:root` resource cannot resolve, so its
  // population phase throws — the ordinary sibling beside it still waives its finding.
  const root = await plantedTree(
    mixedTree(repoRoot, {
      [`${GATES}/${HARD_RESOURCE}.ts`]: shim(repoRoot, HARD_RESOURCE),
      [UI_MENU]: `// @orb-waive ${ORDINARY}(asChild): planted — reconciled beside a failed owner\n${AS_CHILD_LINE}`,
    }),
  );
  const res = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(res).toExitWith(2);
  const report = readArtifact(root);
  const failed = finalRow(report, HARD_RESOURCE);
  expect(failed.owner).toMatchObject({ status: "incomplete", population: "incomplete" });
  expect(failed.withheld).toBe(true);
  expect(failed.ok).toBe(false);
  expect(report.run.final.withheld).toBe(1);
  expect(policyOf(report).toolErrors).toEqual([{ policyId: HARD_RESOURCE, phase: "population", message: expect.stringContaining("package.json") }]);
  expect(policyOf(report).authority.withheldPolicyIds).toEqual([HARD_RESOURCE]);
  expect(policyOf(report).authority.toolErrors.map((e) => e.kind)).toEqual(["owner-incomplete"]);
  // the sibling reconciled: its waiver was consumed, its row is ok, and it is NOT withheld
  const ordinary = finalRow(report, ORDINARY);
  expect(ordinary).toMatchObject({ ok: true, waived: 1, withheld: false });
  expect(res.stdout).toContain(`⚠ ${HARD_RESOURCE}`);
  expect(res.stdout).toContain("WITHHELD by authority");
});

// ── 11. exit status and JSON are deterministic ────────────────────────────────────────────────────────────

/** The fields a second run legitimately changes: run identity, clocks, cost. Everything else must be byte-equal. */
function stable(report: StructureReport): unknown {
  const { run, policy, gates, ...rest } = report;
  const { runId, startedAt, finishedAt, artifactDir, concurrent, ...runRest } = run;
  void runId;
  void startedAt;
  void finishedAt;
  void artifactDir;
  void concurrent;
  return {
    ...rest,
    run: runRest,
    gates: gates.map((g) => {
      const { timing: t, ...g2 } = g;
      void t;
      return g2;
    }),
    policy: policy === null ? null : { ...policy, timing: undefined, facts: policy.facts.map((f) => ({ ...f, timing: undefined })) },
  };
}

test("two runs over the same tree produce the same exit and the same artifact modulo identity and clocks", { timeout: RUN_TIMEOUT_MS * 2 }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree(mixedTree(repoRoot, { [UI_MENU]: AS_CHILD_LINE, [GRANT_SUBJECT]: MATCH_MEDIA_LINE }));
  const first = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  const firstReport = stable(readArtifact(root));
  const second = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  expect(second.code).toBe(first.code);
  expect(stable(readArtifact(root))).toEqual(firstReport);
});

// ── 12. the one reader renders both ──────────────────────────────────────────────────────────────────────

test("check:show reads the artifact: a policy row in its own vocabulary, with its authority and position", { timeout: RUN_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree(mixedTree(repoRoot, { [UI_MENU]: AS_CHILD_LINE }));
  expect((await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS })).code).toBe(1);
  const shown = await runCli("verify", ["show", "--gate", ORDINARY], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  expect(shown.stdout).toContain(`✗ ${ORDINARY} (1 violation)`);
  expect(shown.stdout).toContain("final ordinary/error · population");
  expect(shown.stdout).toContain(`${UI_MENU}:1:32`);
  const all = await runCli("verify", ["show", "--errors-only"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(all).toExitWith(1);
  expect(all.stdout).toContain("AUTHORITY ALARM");
});
