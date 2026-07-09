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

type Stage = {
  readonly name: string;
  readonly argv: readonly [string, ...string[]];
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
  { name: "check:structure", argv: ["pnpm", "check:structure"] },
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
  readonly stages: readonly StageResult[];
};

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

  const exitCode = result.status ?? 1;
  return { name: stage.name, ok: exitCode === 0, exitCode, durationMs, logFile };
}

function writeCheckReport(root: string, stages: readonly StageResult[]): CheckReport {
  const failures = stages.filter((s) => !s.ok).length;
  const report: CheckReport = { ok: failures === 0, failures, stages };
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

function main(): void {
  const root = process.cwd();
  mkdirSync(join(root, "reports", "check"), { recursive: true });

  printHeadPointer();

  const stages = STAGES.map((stage) => runStage(root, stage));
  const report = writeCheckReport(root, stages);

  process.stdout.write("\n=== check summary ===\n");
  for (const stage of stages) {
    const mark = stage.ok ? "✓" : "✗";
    process.stdout.write(`${mark} ${stage.name} (${stage.durationMs}ms)\n`);
  }
  process.stdout.write(
    report.ok ? "\nall stages passed\n" : `\n${report.failures} stage(s) failed\n`,
  );

  printTailPointer(report, stages);

  if (!report.ok) {
    process.exit(1);
  }
}

main();
