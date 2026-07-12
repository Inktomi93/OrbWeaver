// The `pnpm check` orchestrator — runs all six gate stages SEQUENTIALLY (they contend for
// CPU/tsc, so no parallelism) and ALWAYS runs every stage regardless of earlier failures. The
// old `&&` chain in package.json stopped at the first red stage, hiding later failures and
// forcing multiple reruns to discover them all. This streams each stage's output live (the user
// watches it), tees it to reports/check/<stage>.log, and writes a consolidated reports/check.json
// so failures persist across runs instead of scrolling off the terminal.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

type Stage = {
  readonly name: string;
  readonly argv: readonly [string, ...string[]];
  /** True ONLY for a stage whose child speaks THIS exit-code scheme (0/1/2/3) — i.e. check:structure
   *  (report.ts). External tools (tsc exits 2 on type errors, biome/eslint their own) do NOT: for them
   *  any non-zero is a "violations" verdict (1); only a signal-kill is a tool error. */
  readonly speaksScheme?: boolean;
};

const STAGES: readonly Stage[] = [
  { name: "lint", argv: ["pnpm", "lint"] },
  { name: "lint:eslint", argv: ["pnpm", "lint:eslint"] },
  { name: "typecheck", argv: ["pnpm", "typecheck"] },
  // The ROOT-program net: packages + scripts + TESTS as one tsc program (the root tsconfig.json's
  // whole-graph include). Per-package `typecheck` validates each package under its OWN libs/strictness;
  // vitest transpiles tests without typechecking — so before this stage, a contract tightening could
  // leave a .test.ts type-stale with every gate green (found live 2026-07-09: a branded-id change left
  // a fixture stale for an hour, invisible to all six stages).
  { name: "typecheck:graph", argv: ["pnpm", "typecheck:graph"] },
  { name: "test:types", argv: ["pnpm", "test:types"] },
  { name: "check:structure", argv: ["pnpm", "check:structure"], speaksScheme: true },
  { name: "depcruise", argv: ["pnpm", "depcruise"] },
  // The docs-formatter drift check — a hand-edited/unformatted architecture doc (e.g. a broken PD
  // table) was invisible to all 7 other stages until it landed in a doc-reading agent's face. Was
  // advisory-only per format-md.ts's own header comment; promoted into the fast lane 2026-07-09.
  { name: "check:docs", argv: ["pnpm", "check:docs"] },
];

/** Per-stage result — mirrors `check-structure.json`'s idiom (report.ts) of a flat array of
 *  gate/stage outcomes plus a top-level ok + count, written unconditionally after the run. */
type StageResult = {
  readonly name: string;
  readonly ok: boolean;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly logFile: string;
};

type CheckReport = {
  readonly ok: boolean;
  readonly failures: number;
  readonly exitCode: number;
  readonly stages: readonly StageResult[];
};

// The distinct exit-code scheme (TSMORPH-SINGLE-PASS-AUDIT.md §9.4): "the checker BROKE" must never read
// as "clean" or as "found violations". Severity is ordered 2 > 1 > 0 so the run's exit is the MAX over
// stages — a single tool-broken stage surfaces as a tool error for the whole run even if others merely
// found violations. `3` (misuse) is not produced by stage aggregation; it is reserved for a bad-args
// front door and passes through unchanged if a child ever emits it.
const EXIT_CLEAN = 0; // zero violations, every stage ran
const EXIT_VIOLATIONS = 1; // a stage found rule violations (child exited 1) and every stage ran
const EXIT_TOOL_ERROR = 2; // a stage crashed / was killed by signal / exited ≥2 — the run isn't trustworthy
const EXIT_MISUSE = 3; // bad CLI args (reserved; passed through if a child emits it)

/** Map a spawnSync result to this scheme. A null status = killed by signal (no clean exit) = tool error,
 *  always. For a `speaksScheme` stage (check:structure/report.ts) the child's 0/1/2/3 IS the verdict.
 *  For every OTHER stage — external tools with their own conventions (tsc exits 2 on type errors!) — any
 *  non-zero is a "violations" verdict (1); we do not mistake tsc's 2 for a broken checker.
 *  Exported for the exit-code unit test (tests/tooling/check-run-exit-codes.int.test.ts). */
export function classifyExit(status: number | null, speaksScheme = false): number {
  if (status === null) {
    return EXIT_TOOL_ERROR; // signal-killed: never a code verdict
  }
  if (status === EXIT_CLEAN) {
    return EXIT_CLEAN;
  }
  if (speaksScheme) {
    if (status === EXIT_VIOLATIONS || status === EXIT_TOOL_ERROR || status === EXIT_MISUSE) {
      return status;
    }
    return EXIT_TOOL_ERROR; // an unexpected code from a scheme-speaking child is itself a tool error
  }
  return EXIT_VIOLATIONS; // external tool, non-zero → its normal "found problems" failure
}

// Severity ordering for the run-level MAX: tool-error (2) beats misuse (3) beats violations (1) beats
// clean (0). (A broken checker is the loudest signal; misuse still dominates a mere violation.)
const SEVERITY_RANK: Readonly<Record<number, number>> = {
  [EXIT_TOOL_ERROR]: 3,
  [EXIT_MISUSE]: 2,
  [EXIT_VIOLATIONS]: 1,
  [EXIT_CLEAN]: 0,
};

function severityRank(exitCode: number): number {
  return SEVERITY_RANK[exitCode] ?? 0;
}

/** The run's exit code = the highest-severity stage exit (2 > 3 > 1 > 0).
 *  Exported for the exit-code unit test. */
export function aggregateExit(stages: readonly Pick<StageResult, "exitCode">[]): number {
  let worst = EXIT_CLEAN;
  for (const stage of stages) {
    if (severityRank(stage.exitCode) > severityRank(worst)) {
      worst = stage.exitCode;
    }
  }
  return worst;
}

function runStage(root: string, stage: Stage): StageResult {
  const header = `\n=== ${stage.name} (${stage.argv.join(" ")}) ===\n`;
  process.stdout.write(header);

  const start = Date.now();
  const [cmd, ...args] = stage.argv;
  const result = spawnSync(cmd, args, {
    cwd: root,
    shell: false,
    encoding: "utf8",
  });
  const durationMs = Date.now() - start;

  const output = `${header}${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");

  const logFile = join("reports", "check", `${stage.name.replace(/:/g, "-")}.log`);
  writeFileSync(join(root, logFile), output);

  // Distinct scheme (§9.4): a signal-kill is a TOOL error; a scheme-speaking stage's 2 is a tool error;
  // an external tool's non-zero is a violation. The old `result.status ?? 1` collapsed ALL of these into
  // an indistinct `1` (and mapped a signal-kill to a violation too).
  const exitCode = classifyExit(result.status, stage.speaksScheme === true);
  return { name: stage.name, ok: exitCode === EXIT_CLEAN, exitCode, durationMs, logFile };
}

function writeCheckReport(root: string, stages: readonly StageResult[]): CheckReport {
  const failures = stages.filter((s) => !s.ok).length;
  const exitCode = aggregateExit(stages);
  const report: CheckReport = { ok: exitCode === EXIT_CLEAN, failures, exitCode, stages };
  writeFileSync(join(root, "reports", "check.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

/** Agents habitually `head`/`tail` this output instead of reading it all — so the pointer to the
 *  persisted detail is printed at BOTH ends: once before any stage runs (in case they only read
 *  the head) and once after the summary (in case they only read the tail). The tail line also
 *  names each failed stage's specific log path inline, so a tailing agent lands directly on the
 *  right file without having to cross-reference the summary block above it. */
function printHeadPointer(): void {
  process.stdout.write(
    "[check] full per-stage logs → reports/check/<stage>.log · summary json → reports/check.json\n",
  );
}

function printTailPointer(report: CheckReport, stages: readonly StageResult[]): void {
  if (report.ok) {
    process.stdout.write("[check] clean — summary: reports/check.json\n");
    return;
  }
  const failed = stages.filter((s) => !s.ok);
  const names = failed.map((s) => s.name).join(", ");
  const logs = failed.map((s) => s.logFile).join(", ");
  process.stdout.write(
    `[check] FAILED: ${names} — error detail in ${logs} · summary: reports/check.json\n`,
  );
}

function stageMark(ok: boolean, toolBroke: boolean): string {
  if (ok) {
    return "✓";
  }
  return toolBroke ? "‼" : "✗";
}

function main(): void {
  const root = process.cwd();
  mkdirSync(join(root, "reports", "check"), { recursive: true });

  printHeadPointer();

  const stages = STAGES.map((stage) => runStage(root, stage));
  const report = writeCheckReport(root, stages);

  process.stdout.write("\n=== check summary ===\n");
  for (const stage of stages) {
    const toolBroke = stage.exitCode === EXIT_TOOL_ERROR;
    const mark = stageMark(stage.ok, toolBroke);
    const tag = !stage.ok && toolBroke ? " [tool-error]" : "";
    process.stdout.write(`${mark} ${stage.name} (${stage.durationMs}ms)${tag}\n`);
  }
  if (report.ok) {
    process.stdout.write("\nall stages passed\n");
  } else if (report.exitCode === EXIT_TOOL_ERROR) {
    process.stdout.write(`\n${report.failures} stage(s) failed — a stage TOOL-ERRORED (exit 2)\n`);
  } else {
    process.stdout.write(`\n${report.failures} stage(s) failed\n`);
  }

  printTailPointer(report, stages);

  if (report.exitCode !== EXIT_CLEAN) {
    process.exit(report.exitCode);
  }
}

// Direct-run guard (the report.ts idiom): `pnpm check` runs `main()`; an import (the exit-code unit
// test) gets only the exported pure helpers — importing this module must NOT spawn the whole gate battery.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main();
}
