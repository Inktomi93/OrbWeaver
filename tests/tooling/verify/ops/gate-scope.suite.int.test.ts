// THE GATE-SCOPED DOOR ON THE MIXED FRONT DOOR, both sides (#1964/#1973/#2069).
//
// WHY IT EXISTS. The §8.8 per-conversion floor names a real-tree `pnpm check:structure` run. On 2026-09-12 that
// run measured ~322s of dispatcher time (110s legacy + 212s final; `policy-soundness` ALONE is 112s of it), so
// no lane ran it — and that economy is what let a fully-withheld dead policy ship green (#1973). `--check <id>`
// / `--family <name>` make "what does MY gate report on the REAL tree" cost one gate instead of the corpus.
//
// WHY BOTH DIRECTIONS ARE ASSERTED, ALWAYS. The absent-flag arm is the CURRENT behaviour, so a suite that only
// asserted the selected arm would pass just as green against a build that silently narrowed EVERY run — which
// would turn `pnpm check:structure` into a partial verdict for the whole repo. The default arm is therefore the
// load-bearing half: same roster, same counts, and the pointer still published.
//
// AND THE THIRD PROPERTY, which is the one a scoped door gets wrong: a selected run must be UNMISTAKABLE for the
// corpus verdict. It records its selection in the manifest and does NOT republish
// `reports/check-structure.json`, so a reader holding the fixed path can never pick up a partial report as the
// whole one. That is asserted here by pointing the pointer at a whole run FIRST and proving a selected run
// leaves it alone.
//
// THE SUBJECT IS THE DOOR, so the corpus is planted rather than shimmed: two legacy descriptors (one silent,
// one loud) and three `defineGate` policies (a two-member family plus a singleton), so every selection shape
// has something it must include AND something it must exclude. A selection that accidentally ran everything and
// a selection that accidentally ran nothing both fail here.
import { existsSync, lstatSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { StructureReport } from "../../../../tooling/src/verify/contract/structure-report.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

/** A spawned run over a planted root loads the harness Project and both dispatchers: ~3-6 s quiet. */
const RUN_TIMEOUT_MS = scaledBudget(120_000);

const GATES = "tooling/src/verify/gates";
/** The two final families: a two-member one (so `--family` must pull siblings) and a singleton (which the
 *  loader requires to be named for its id). */
const DUO_FAMILY = "scoped-duo";
const ALPHA = "scoped-alpha";
const BETA = "scoped-beta";
const LONE = "scoped-lone";
const SILENT_LEGACY = "planted-ok";
const LOUD_LEGACY = "planted-loud";
const EVERY_GATE = [ALPHA, BETA, LONE, SILENT_LEGACY, LOUD_LEGACY].toSorted();

const SUBJECT_DIR = "packages/client/src/features/probe";
const ALPHA_SUBJECT = `${SUBJECT_DIR}/alpha.ts`;
const BETA_SUBJECT = `${SUBJECT_DIR}/beta.ts`;
const LONE_SUBJECT = `${SUBJECT_DIR}/lone.ts`;
const LEGACY_SUBJECT = `${SUBJECT_DIR}/legacy.ts`;
/** Every subject line is `export const <name> = 1;`, and `export const ` is 13 characters — so the token starts
 *  at column 14. The central ordinary-waiver engine raises an AUTHORITY ALARM when a finding's `token` is not
 *  the exact slice at its reported position, and an alarm is unconditionally blocking, which would make the
 *  exit codes here say something other than what this suite is measuring. */
const SUBJECT_COLUMN = 14;
function subject(name: string): string {
  return `export const ${name} = 1;\n`;
}

/** A minimal, VALID final policy reporting exactly one finding on one planted file, importing the REAL
 *  `defineGate` by absolute file URL (the loader refuses an unbranded lookalike). */
interface PlantedPolicy {
  readonly id: string;
  readonly family: string;
  /** Each policy owns ONE subject file, so "which policies ran" is readable off the violation list as well as
   *  off the roster — a selection that ran the wrong sibling is visible, not just a miscount. */
  readonly subjectPath: string;
  readonly token: string;
}

/** `workItem` is FORBIDDEN at `severity: "error"` (lib/policy-module.ts:51) — measured here as a load-time tool
 *  error before it was removed. */
function plantedPolicy(repoRoot: string, { id, family, subjectPath, token }: PlantedPolicy): string {
  const contract = JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/contract/policy.ts")).href);
  return [
    `import { defineGate } from ${contract};`,
    "",
    "export const gate = defineGate({",
    `  id: ${JSON.stringify(id)},`,
    `  family: ${JSON.stringify(family)},`,
    '  authority: "ordinary",',
    '  severity: "error",',
    '  population: { of: "all", why: "the planted tree is this fixture policy\'s whole world" },',
    '  analysis: "syntax",',
    '  execution: "selected-files",',
    "  facts: [],",
    "  resources: [],",
    `  message: ${JSON.stringify(`planted debt for ${id}`)},`,
    `  fix: ${JSON.stringify(`delete the planted subject, or waive it with \`@orb-waive ${id}(<position>): <reason>\``)},`,
    "  create: (ctx) => ({",
    "    visitFile: (sourceFile) => {",
    "      const path = ctx.relativePath(sourceFile);",
    `      if (path === ${JSON.stringify(subjectPath)}) {`,
    `        ctx.report.file(path, { line: 1, column: ${SUBJECT_COLUMN}, token: ${JSON.stringify(token)} });`,
    "      }",
    "    },",
    "  }),",
    `  mustFlag: [{ mode: "source", files: { ${JSON.stringify(subjectPath)}: ${JSON.stringify(subject(token))} }, expect: { count: 1, line: 1, token: ${JSON.stringify(token)} }, why: "the planted subject is the one file this fixture policy reports" }],`,
    `  mustPass: [{ mode: "source", files: { "${SUBJECT_DIR}/quiet.ts": ${JSON.stringify(subject("quiet"))} }, why: "every other source file is silent" }],`,
    "});",
    "",
  ].join("\n");
}

/** The silent legacy control (structure.int.test.ts's shape): scans everything, flags nothing. */
const SILENT_GATE = `export const gate = {
  name: ${JSON.stringify(SILENT_LEGACY)},
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

/** The LOUD legacy control: it fires on one planted file, so "this gate did not run" is visible as a MISSING
 *  violation rather than only as a missing row. */
const LOUD_GATE = `export const gate = {
  name: ${JSON.stringify(LOUD_LEGACY)},
  docRow: "Core-Enforcement-Active-Gates.md",
  status: "active",
  scopeSafety: "incremental-safe",
  message: "the planted loud gate — it flags the legacy subject",
  scanRoot: () => true,
  visitFile: (sourceFile, ctx) => {
    const path = sourceFile.getFilePath().slice(ctx.root.length + 1);
    if (path === ${JSON.stringify(LEGACY_SUBJECT)}) {
      ctx.report({ file: path, line: 1, column: ${SUBJECT_COLUMN}, message: "the planted legacy finding" });
    }
  },
  mustFlag: [{ files: "export const a = 1;\\n" }],
  mustPass: [{ files: "export const b = 1;\\n" }],
};
`;

function plantedTreeFiles(repoRoot: string): Readonly<Record<string, string>> {
  return {
    [`${GATES}/${ALPHA}.ts`]: plantedPolicy(repoRoot, { id: ALPHA, family: DUO_FAMILY, subjectPath: ALPHA_SUBJECT, token: "alpha" }),
    [`${GATES}/${BETA}.ts`]: plantedPolicy(repoRoot, { id: BETA, family: DUO_FAMILY, subjectPath: BETA_SUBJECT, token: "beta" }),
    [`${GATES}/${LONE}.ts`]: plantedPolicy(repoRoot, { id: LONE, family: LONE, subjectPath: LONE_SUBJECT, token: "lone" }),
    [`${GATES}/${SILENT_LEGACY}.ts`]: SILENT_GATE,
    [`${GATES}/${LOUD_LEGACY}.ts`]: LOUD_GATE,
    [ALPHA_SUBJECT]: subject("alpha"),
    [BETA_SUBJECT]: subject("beta"),
    [LONE_SUBJECT]: subject("lone"),
    [LEGACY_SUBJECT]: subject("legacy"),
    [`${SUBJECT_DIR}/quiet.ts`]: subject("quiet"),
  };
}

const POINTER = ["reports", "check-structure.json"];

function readPointer(root: string): StructureReport {
  return JSON.parse(readFileSync(join(root, ...POINTER), "utf8")) as StructureReport;
}

/** The run's OWN artifact, taken from the slot its manifest names — never the pointer, which a selected run
 *  deliberately does not touch. */
function readSlotArtifact(root: string, stdout: string): StructureReport {
  const slot = /reports\/runs\/structure\/[^\s)]+\/check-structure\.json/u.exec(stdout);
  if (slot === null) {
    throw new Error(`no run-slot artifact path on stdout:\n${stdout}`);
  }
  return JSON.parse(readFileSync(join(root, slot[0]), "utf8")) as StructureReport;
}

/** One row without its clock, so two runs of the same gate can be compared field for field. */
function withoutTiming(row: StructureReport["gates"][number] | undefined): Record<string, unknown> {
  if (row === undefined) {
    throw new Error("no row to compare");
  }
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== "timing"));
}

function ranGates(report: StructureReport): readonly string[] {
  return report.gates.map((gate) => gate.name).toSorted();
}

test("the DEFAULT run is unchanged: every gate, the whole roster, and the published pointer", { timeout: RUN_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree(plantedTreeFiles(repoRoot));
  const whole = await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  // three planted violations (alpha, beta, legacy) — a verdict about the TREE, never a tool error
  await expect(whole).toExitWith(1);

  const report = readPointer(root);
  expect(ranGates(report)).toEqual(EVERY_GATE);
  expect(report.run.selection).toEqual({ kind: "all" });
  expect(report.run.quiet).toBe(true);
  expect(report.run.legacy).toEqual({ registered: 2, active: 2, ran: 2 });
  expect(report.run.final).toEqual({ registered: 3, ran: 3, withheld: 0 });
  expect(report.run.incompleteReasons).toEqual([]);
  expect(report.toolErrors).toEqual([]);
  expect(whole.stdout).toContain("run COMPLETE");
});

test("--check <id> runs ONLY that policy over the SAME whole tree, and leaves the published pointer alone", {
  timeout: RUN_TIMEOUT_MS * 2,
}, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await plantedTree(plantedTreeFiles(repoRoot));
  // publish a whole-corpus verdict FIRST, so "the selected run did not republish" is a real claim
  await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  const wholeReport = readPointer(root);
  const wholeRunId = wholeReport.run.runId;
  const wholeAlpha = wholeReport.gates.find((gate) => gate.name === ALPHA);

  const scoped = await runCli("verify", ["structure", "--check", ALPHA], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(scoped).toExitWith(1);
  const report = readSlotArtifact(root, scoped.stdout);
  expect(report.run.runId).not.toBe(wholeRunId);
  expect(ranGates(report)).toEqual([ALPHA]);
  expect(report.run.selection).toEqual({ kind: "check", names: [ALPHA] });
  expect(report.run.legacy).toEqual({ registered: 0, active: 0, ran: 0 });
  expect(report.run.final).toEqual({ registered: 1, ran: 1, withheld: 0 });
  // THE LOAD-BEARING RECEIPT: the selected run's row for this policy is the row the WHOLE-CORPUS run
  // produced for it, field for field — population denominator, receipts, waived/granted counts and all. The
  // door narrows WHO RUNS; it must not narrow, widen or otherwise move what the selected gate SEES. A
  // literal-only assertion would pass against a build whose selected population was quietly different.
  // `timing` is the ONE excluded field and it is excluded because it is a clock — measured here: with it in,
  // the two rows differ ONLY in `phaseMs`/`totalMs`, which is itself the receipt that nothing else moved.
  expect(withoutTiming(report.gates[0])).toEqual(withoutTiming(wholeAlpha));
  expect(report.gates[0]?.violations).toEqual([
    { file: ALPHA_SUBJECT, line: 1, column: SUBJECT_COLUMN, token: "alpha", severity: "error", message: `planted debt for ${ALPHA}` },
  ]);
  // #1973's two numbers, now reachable for ONE policy
  expect(scoped.stdout).toContain("tool error(s)");
  expect(scoped.stdout).toContain("0 withheld");
  expect(scoped.stdout).toContain("SELECTED RUN");
  expect(scoped.stdout).toContain("NOT a whole-corpus verdict");

  // the pointer still resolves to the WHOLE run: a partial report can never be picked up as the corpus verdict
  expect(readPointer(root).run.runId).toBe(wholeRunId);
  expect(lstatSync(join(root, ...POINTER)).isSymbolicLink()).toBe(true);
});

test("--check reaches a LEGACY gate by name — one flat id namespace across both contracts", { timeout: RUN_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree(plantedTreeFiles(repoRoot));
  const scoped = await runCli("verify", ["structure", "--check", LOUD_LEGACY], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(scoped).toExitWith(1);
  const report = readSlotArtifact(root, scoped.stdout);
  expect(ranGates(report)).toEqual([LOUD_LEGACY]);
  expect(report.run.legacy).toEqual({ registered: 1, active: 1, ran: 1 });
  expect(report.run.final).toEqual({ registered: 0, ran: 0, withheld: 0 });
  // no final policy ran, so the artifact carries no final block at all — and that is not a short run
  expect(report.policy).toBeNull();
  expect(report.run.incompleteReasons).toEqual([]);
  expect(report.gates[0]?.violations).toEqual([{ file: LEGACY_SUBJECT, line: 1, message: "the planted legacy finding" }]);
});

test("--family <name> pulls the whole family and nothing else", { timeout: RUN_TIMEOUT_MS }, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await plantedTree(plantedTreeFiles(repoRoot));
  const scoped = await runCli("verify", ["structure", "--family", DUO_FAMILY], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(scoped).toExitWith(1);
  const report = readSlotArtifact(root, scoped.stdout);
  expect(ranGates(report)).toEqual([ALPHA, BETA].toSorted());
  expect(report.run.selection).toEqual({ kind: "family", names: [DUO_FAMILY] });
  expect(report.run.final).toEqual({ registered: 2, ran: 2, withheld: 0 });
  expect(report.run.incompleteReasons).toEqual([]);
});

test("a selection that names nothing is MISUSE, refused before the slot opens — never a clean zero", { timeout: RUN_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree(plantedTreeFiles(repoRoot));

  const unknown = await runCli("verify", ["structure", "--check", "no-such-gate"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(unknown).toExitWith(3);
  expect(unknown.stderr).toContain("unknown check selection(s): no-such-gate");
  // the failure this door exists to close: a run that reports a clean zero about a gate it never ran
  expect(existsSync(join(root, "reports"))).toBe(false);

  // a FAMILY name is final-only: a legacy gate name is not a family
  const notAFamily = await runCli("verify", ["structure", "--family", LOUD_LEGACY], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(notAFamily).toExitWith(3);
  expect(notAFamily.stderr).toContain(`unknown family selection(s): ${LOUD_LEGACY}`);

  // and the two selectors are mutually exclusive — a grammar refusal, so it never reaches the loader
  const both = await runCli("verify", ["structure", "--check", ALPHA, "--family", DUO_FAMILY], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(both).toExitWith(3);
  expect(both.stderr).toContain("selection is ambiguous");
  expect(existsSync(join(root, "reports"))).toBe(false);
});

// ── #2069: a run that observed planted fixture paths is NOT QUIET, and says so ────────────────────────────
//
// A fixture-planting suite writes `__g_` files INSIDE the real package tree for the length of its own child
// run, so an overlapping structure run judges a tree that does not exist. Slot `main-2930600` (2026-09-12) came
// back with inflated raw counts that read exactly like a real number. The negative arm below is the load-bearing
// half: without it, a build that marked EVERY run not-quiet would pass the positive arm.

const PLANTED_FILE = `${SUBJECT_DIR}/__g_planted.ts`;
const PLANTED_DIR_FILE = "packages/server/src/domain/__g_dir/x.ts";
const NOT_QUIET = "OBSERVED";

test("a QUIET run says so — the negative control the positive arm is worthless without", { timeout: RUN_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree(plantedTreeFiles(repoRoot));
  const quiet = await runCli("verify", ["structure", "--check", SILENT_LEGACY], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(quiet).toExitWith(0);
  const report = readSlotArtifact(root, quiet.stdout);
  expect(report.run.quiet).toBe(true);
  expect(report.run.incompleteReasons).toEqual([]);
  expect(quiet.stdout).not.toContain(NOT_QUIET);
});

test("a run that OBSERVES a planted fixture path refuses to be a verdict (exit 2), by file AND by directory", {
  timeout: RUN_TIMEOUT_MS * 2,
}, async ({ plantedTree, repoRoot, runCli }) => {
  const byFile = await plantedTree({ ...plantedTreeFiles(repoRoot), [PLANTED_FILE]: subject("planted") });
  const file = await runCli("verify", ["structure", "--check", SILENT_LEGACY], { cwd: byFile, timeoutMs: RUN_TIMEOUT_MS });
  // exit 2, not 1: the run is not a verdict at all — it is not "a verdict with a violation in it"
  await expect(file).toExitWith(2);
  const fileReport = readSlotArtifact(byFile, file.stdout);
  expect(fileReport.run.quiet).toBe(false);
  expect(fileReport.run.incompleteReasons.join(" ")).toContain(PLANTED_FILE);
  expect(fileReport.ok).toBe(false);
  expect(file.stdout).toContain(NOT_QUIET);

  // the planter creates `__g_` DIRECTORIES too (`packages/server/src/domain/__g_struct/index.ts`) — the sweep
  // names the directory, which is the entry that matches
  const byDir = await plantedTree({ ...plantedTreeFiles(repoRoot), [PLANTED_DIR_FILE]: subject("planted") });
  const dir = await runCli("verify", ["structure", "--check", SILENT_LEGACY], { cwd: byDir, timeoutMs: RUN_TIMEOUT_MS });
  await expect(dir).toExitWith(2);
  expect(readSlotArtifact(byDir, dir.stdout).run.incompleteReasons.join(" ")).toContain("packages/server/src/domain/__g_dir");
});

test("the PLANTER's own child run is exempt: ORB_GATE_FIXTURES=1 must see what it planted", { timeout: RUN_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree({ ...plantedTreeFiles(repoRoot), [PLANTED_FILE]: subject("planted") });
  const own = await runCli("verify", ["structure", "--check", SILENT_LEGACY], {
    cwd: root,
    timeoutMs: RUN_TIMEOUT_MS,
    // biome-ignore lint/style/noProcessEnv: passthrough env for the spawned child — harness plumbing, not app config.
    // biome-ignore lint/correctness/noProcessGlobal: same passthrough; this file is node-run tooling.
    // biome-ignore lint/style/useNamingConvention: ORB_GATE_FIXTURES is an environment variable name.
    env: { ...process.env, ORB_GATE_FIXTURES: "1" } as Record<string, string>,
  });
  await expect(own).toExitWith(0);
  expect(readSlotArtifact(root, own.stdout).run.quiet).toBe(true);
});

// ── #2167: IS THIS ARTIFACT ABOUT THE REAL TREE? ──────────────────────────────────────────────────────────
//
// `complete` answers "did the run FINISH". It never answered "is what it finished ABOUT THE REAL TREE", and on
// 2026-09-12 a fresh-context verifier built a REAL-TREE LIVENESS section on slot `main-2930600` — a
// FIXTURE-MODE run whose `__g_` findings are the gate self-test's own props. THREE of twelve published slots
// were that shape. Those runs were complete, correct and legitimate; the LABEL was missing, not the content.
//
// The quiet arm above is this section's negative control, asserted again here on the field itself: a build
// that stamped EVERY run a non-verdict would pass every positive arm below.

test("a FIXTURE-MODE run stamps itself a non-verdict, keeps its exit code, and never publishes the pointer", {
  timeout: RUN_TIMEOUT_MS * 2,
}, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await plantedTree(plantedTreeFiles(repoRoot));
  // a REAL run first, so "the pointer was not republished" is a claim about an existing pointer
  await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  const realRunId = readPointer(root).run.runId;
  expect(readPointer(root).run.verdict).toBe("verdict");
  expect(readPointer(root).run.nonVerdictReason).toBeNull();

  const fixture = await runCli("verify", ["structure"], {
    cwd: root,
    timeoutMs: RUN_TIMEOUT_MS,
    // biome-ignore lint/style/noProcessEnv: passthrough env for the spawned child — harness plumbing, not app config.
    // biome-ignore lint/correctness/noProcessGlobal: same passthrough; this file is node-run tooling.
    // biome-ignore lint/style/useNamingConvention: ORB_GATE_FIXTURES is an environment variable name.
    env: { ...process.env, ORB_GATE_FIXTURES: "1" } as Record<string, string>,
  });
  // THE EXIT CODE IS UNCHANGED, deliberately: check-gates.repo.int.test.ts parses its own child's stdout
  // roster and tolerates 0/1 only, so making the planter's run exit 2 would red the suite that produces the
  // artifact. The refusal lives in the READERS and in the publisher, never in the producer's exit.
  await expect(fixture).toExitWith(1);
  expect(fixture.stdout).toContain("THIS RUN IS NOT A VERDICT");
  expect(fixture.stdout).toContain("FIXTURE MODE");

  const report = readSlotArtifact(root, fixture.stdout);
  expect(report.run.verdict).toBe("non-verdict");
  expect(report.run.nonVerdictReason).toContain("ORB_GATE_FIXTURES=1");
  expect(report.run.complete).toBe(true); // it FINISHED — that axis is untouched (#410)
  // and the pointer still resolves to the REAL run: the self-test's artifact never becomes `latest`
  expect(readPointer(root).run.runId).toBe(realRunId);
});

test("a CONTAMINATED run is a non-verdict too — same field, different reason", { timeout: RUN_TIMEOUT_MS }, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await plantedTree({ ...plantedTreeFiles(repoRoot), [PLANTED_FILE]: subject("planted") });
  const run = await runCli("verify", ["structure", "--check", SILENT_LEGACY], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(run).toExitWith(2);
  const report = readSlotArtifact(root, run.stdout);
  expect(report.run.verdict).toBe("non-verdict");
  expect(report.run.nonVerdictReason).toContain(PLANTED_FILE);
  expect(report.run.nonVerdictReason).not.toContain("FIXTURE MODE");
});

test("--void tombstones an existing slot, and check:show then REFUSES it and prints the reason", {
  timeout: RUN_TIMEOUT_MS * 2,
}, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await plantedTree(plantedTreeFiles(repoRoot));
  await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  const slot = readPointer(root).run.runId;

  // THE NEGATIVE CONTROL FIRST: before the void, `show` consumes this artifact and reports the tree's verdict
  const before = await runCli("verify", ["show"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(before).toExitWith(1); // planted violations — a verdict, not a refusal
  expect(before.stdout).not.toContain("NOT a verdict about the real tree");

  const reason = "voided by the orchestrator: this run overlapped a planting suite";
  const voided = await runCli("verify", ["structure", "--void", slot, "--reason", reason], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(voided).toExitWith(0);
  expect(voided.stdout).toContain("TOMBSTONED");

  const after = await runCli("verify", ["show"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(after).toExitWith(2);
  expect(after.stdout).toContain("NOT a verdict about the real tree");
  expect(after.stdout).toContain(reason);
});

test("--void refuses what it cannot do: an absent slot, a missing reason, and a run flag beside it", { timeout: RUN_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree(plantedTreeFiles(repoRoot));

  const absent = await runCli("verify", ["structure", "--void", "no-such-slot", "--reason", "x"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(absent).toExitWith(3);
  expect(absent.stderr).toContain("no readable artifact");

  // a tombstone without a stated reason is a refusal nobody can act on
  const noReason = await runCli("verify", ["structure", "--void", "whatever"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(noReason).toExitWith(3);
  expect(noReason.stderr).toContain("used together");

  // and it runs NOTHING, so it cannot carry a run's flags
  const mixed = await runCli("verify", ["structure", "--void", "whatever", "--reason", "x", "--check", ALPHA], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(mixed).toExitWith(3);
  expect(mixed.stderr).toContain("runs nothing");
});

// ── #2110: THE PER-POLICY DELTA ───────────────────────────────────────────────────────────────────────────
//
// `check:structure` exits 1 by construction mid-migration, so a NEW red on ONE final policy is invisible in
// the aggregate: `conversion-refusal-liveness` was red on main from the commit that landed it and no run ever
// surfaced it (#2106). The IDENTICAL-PAIR arm is the load-bearing control here — an instrument that reported a
// regression on every pair would pass the regression arm on its own.

test("structure-delta: an identical pair is exit 0, a FALL is exit 0, and a RISE is exit 1 naming the policy", {
  timeout: RUN_TIMEOUT_MS * 4,
}, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await plantedTree(plantedTreeFiles(repoRoot));
  await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  const first = readPointer(root).run.runId;
  await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  const second = readPointer(root).run.runId;

  // THE CONTROL: two runs over one unchanged tree must report no per-policy movement at all.
  const same = await runCli("verify", ["structure-delta", "--before", first, "--after", second], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(same).toExitWith(0);
  expect(same.stdout).toContain("no per-policy change");

  // Move exactly ONE policy. It has to be the FILE, not its contents: `scoped-alpha` reports on the PATH, so
  // rewriting the line leaves its count untouched — measured here as a false "no per-policy change" before the
  // mutation became a delete. Nothing else moves: `Counts` carries no population figure, so the shared
  // denominator shrinking by one file is invisible to every other policy's row.
  rmSync(join(root, ALPHA_SUBJECT));
  await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  const dropped = readPointer(root).run.runId;

  const fell = await runCli("verify", ["structure-delta", "--before", second, "--after", dropped], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(fell).toExitWith(0); // a FALL is movement, not a regression
  expect(fell.stdout).toContain(ALPHA);

  const rose = await runCli("verify", ["structure-delta", "--before", dropped, "--after", second], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(rose).toExitWith(1);
  expect(rose.stdout).toContain(`REGRESSED: ${ALPHA}`);
});

test("structure-delta REFUSES rather than returning a serene zero: no prior slot, and a tombstoned end", {
  timeout: RUN_TIMEOUT_MS * 3,
}, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await plantedTree(plantedTreeFiles(repoRoot));
  await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  const only = readPointer(root).run.runId;

  // ONE slot exists: "there is nothing to compare against" is exit 2, never "nothing changed"
  const alone = await runCli("verify", ["structure-delta"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(alone).toExitWith(2);
  expect(alone.stderr).toContain("no usable PRIOR slot");

  await runCli("verify", ["structure"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  const second = readPointer(root).run.runId;
  // two usable slots now — the control proving the refusal above was about the MISSING prior, not the tool
  const usable = await runCli("verify", ["structure-delta"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(usable).toExitWith(0);

  await runCli("verify", ["structure", "--void", only, "--reason", "voided for this pin"], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  const refused = await runCli("verify", ["structure-delta", "--before", only, "--after", second], { cwd: root, timeoutMs: RUN_TIMEOUT_MS });
  await expect(refused).toExitWith(2);
  expect(refused.stderr).toContain("NON-VERDICT");
  expect(refused.stderr).toContain("voided for this pin");
});
