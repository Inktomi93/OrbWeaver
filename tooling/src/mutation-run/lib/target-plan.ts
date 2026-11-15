// What `pnpm test:mutation:targets` decides before and after its runs: the mode and filter, the start-up check that
// refuses every bad target by name before any run, the aggregate exit and the table.
import { matchesGlob, posix } from "node:path";
import { describeExit, EXIT } from "../../floor/cli/exit-contract.ts";
import { UsageError } from "../../floor/cli/run-tool.ts";
import type { MutationPlan } from "./named-files.ts";
import { planMutationRun } from "./named-files.ts";
import type { StatusCounts } from "./summary.ts";
import type { TargetTests, TestCorpus } from "./target-tests.ts";
import { findTargetTests } from "./target-tests.ts";
import type { MutationTarget } from "./targets.ts";

const LIST_FLAG = "--list";
const CANDIDATES_FLAG = "--candidates";
const TESTS_FLAG = "--tests";
/** Where each target's kept reports and the table land, checkout-relative. `reports/` is gitignored. */
export const TARGET_REPORT_DIR = "reports/mutation/targets";
export const TARGET_TABLE_FILE = `${TARGET_REPORT_DIR}/summary.txt`;

const TARGETS_USAGE = [
  "usage: pnpm test:mutation:targets [<path-part>...] | --list [<path-part>...] | --candidates",
  "Runs `pnpm test:mutation` over each target in tooling/src/mutation-run/lib/targets.ts, one at a time.",
  "A path part keeps the targets whose file contains it. --list prints the targets and their tests; --candidates prints what the history ranks.",
].join("\n");

const TARGET_MODES = ["run", "list", "candidates"] as const;
type TargetMode = (typeof TARGET_MODES)[number];

export interface TargetArgs {
  readonly mode: TargetMode;
  readonly filters: readonly string[];
}

export function parseTargetArgs(args: readonly string[]): TargetArgs {
  const flags = args.filter((arg) => arg.startsWith("-"));
  const filters = args.filter((arg) => !arg.startsWith("-"));
  const unknown = flags.filter((flag) => flag !== LIST_FLAG && flag !== CANDIDATES_FLAG);
  if (unknown.length > 0 || flags.length > 1 || (flags[0] === CANDIDATES_FLAG && filters.length > 0)) {
    throw new UsageError(TARGETS_USAGE);
  }
  const modes: Readonly<Record<string, TargetMode>> = { [LIST_FLAG]: "list", [CANDIDATES_FLAG]: "candidates" };
  return { mode: modes[flags[0] ?? ""] ?? "run", filters };
}

/** Every target whose file contains one of the filters, or all of them with none. A filter that keeps nothing is misuse. */
export function selectTargets(targets: readonly MutationTarget[], filters: readonly string[]): readonly MutationTarget[] {
  if (targets.length === 0) {
    throw new UsageError("the target list is empty; add a row to tooling/src/mutation-run/lib/targets.ts");
  }
  const idle = filters.filter((filter) => !targets.some(({ file }) => file.includes(filter)));
  if (idle.length > 0) {
    throw new UsageError([...idle.map((filter) => `${filter} matches no target`), TARGETS_USAGE].join("\n"));
  }
  return filters.length === 0 ? targets : targets.filter(({ file }) => filters.some((filter) => file.includes(filter)));
}

/** A target that passed the start-up check: the runner's plan and where its tests came from. */
export interface CheckedTarget {
  readonly target: MutationTarget;
  readonly plan: MutationPlan;
  readonly found: TargetTests;
}

function namedTests(named: readonly string[], corpus: TestCorpus): TargetTests | string {
  const idle = named.filter((entry) => !corpus.files.some((test) => test === entry || matchesGlob(test, entry)));
  return idle.length > 0 ? `its named tests ${idle.join(", ")} match no Vitest file` : { sources: ["named"], tests: named };
}

// The runner's own refusal is the first line of its message; the rest is its usage text.
function plannedOrRefusal(args: readonly string[], root: string): MutationPlan | string {
  try {
    return planMutationRun(args, root);
  } catch (error) {
    if (error instanceof UsageError) {
      return error.message.split("\n")[0] ?? error.message;
    }
    throw error;
  }
}

function checkTarget(target: MutationTarget, root: string, corpus: TestCorpus): CheckedTarget | string {
  const found = target.tests === undefined ? findTargetTests(posix.normalize(target.file), corpus, root) : namedTests(target.tests, corpus);
  if (found === null) {
    // The runner's refusal names a bad file or a missing mirror first; a file it accepts still has no test.
    const fileOnly = plannedOrRefusal([target.file], root);
    return typeof fileOnly === "string" ? fileOnly : `${target.file}: no test reaches it through its mirror, an @subject header or an import; name its tests`;
  }
  if (typeof found === "string") {
    return `${target.file}: ${found}`;
  }
  const plan = plannedOrRefusal([target.file, TESTS_FLAG, ...found.tests], root);
  return typeof plan === "string" ? plan : { target, plan, found };
}

/** Every target's plan, or one refusal naming each bad target, before any run starts. */
export function checkTargets(targets: readonly MutationTarget[], root: string, corpus: TestCorpus): readonly CheckedTarget[] {
  const seen = new Set<string>();
  const results = targets.map((target) => {
    const duplicate = seen.has(target.file);
    seen.add(target.file);
    return duplicate ? `${target.file}: listed twice` : checkTarget(target, root, corpus);
  });
  const refusals = results.filter((result) => typeof result === "string");
  if (refusals.length > 0) {
    throw new UsageError(refusals.join("\n"));
  }
  return results.filter((result) => typeof result !== "string");
}

/** One finished or failed target: its exit under the house contract, its counts when Stryker finished, its kept report. */
export interface TargetOutcome {
  readonly file: string;
  readonly exit: number;
  readonly counts: StatusCounts | null;
  readonly report: string | null;
}

/**
 * The aggregate exit: 2 when the pass stopped before its last target or any target is not a verdict, else 1 when any
 * target killed nothing, else 0.
 *
 * @remarks A target's own misuse, such as a file no compiler world holds, is no verdict for that target, so it counts as
 * 2 here; misuse of the command itself is refused before any run.
 */
export function aggregateExit(exits: readonly number[], complete: boolean): number {
  if (!complete || exits.some((exit) => exit !== EXIT.clean && exit !== EXIT.violations)) {
    return EXIT.toolError;
  }
  return exits.includes(EXIT.violations) ? EXIT.violations : EXIT.clean;
}

const PERCENT = 100;

// Stryker's mutation score: detected over detected and undetected. Compile errors, runtime errors and not-measured mutants stay out.
function mutationScore(counts: StatusCounts): number | null {
  const detected = counts.Killed + counts.Timeout;
  const valid = detected + counts.Survived + counts.NoCoverage;
  return valid === 0 ? null : (detected * PERCENT) / valid;
}

const COLUMNS = ["file", "killed", "survived", "no coverage", "timeout", "score", "exit", "report"] as const;

/** The pass's table, one row per target that ran, aligned for a terminal and a text file. */
export function formatTargetTable(outcomes: readonly TargetOutcome[]): string {
  const rows = outcomes.map(({ file, exit, counts, report }) => {
    const score = counts === null ? null : mutationScore(counts);
    const cells = counts === null ? ["-", "-", "-", "-"] : [counts.Killed, counts.Survived, counts.NoCoverage, counts.Timeout].map(String);
    return [file, ...cells, score === null ? "-" : `${score.toFixed(1)}%`, describeExit(exit), report ?? "-"];
  });
  const widths = COLUMNS.map((column, index) => Math.max(column.length, ...rows.map((row) => (row[index] ?? "").length)));
  const line = (cells: readonly string[]): string =>
    cells
      .map((cell, index) => cell.padEnd(widths[index] ?? 0))
      .join("  ")
      .trimEnd();
  return [line(COLUMNS), ...rows.map(line)].join("\n");
}
