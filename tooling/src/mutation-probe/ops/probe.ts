// The planting operation: for each REPORTED survivor, write its exact replacement at its exact location,
// run the mirror suite, and record whether the suite went red and which tests did it. The pristine source
// is restored in a `finally` — never through git, which would risk unrelated uncommitted work.
//
// WHY THIS EXISTS: a Stryker incremental report's Survived rows are not trustworthy. Measured 2026-08-22
// over assemble.ts, 184 of 230 reported survivors were already killed by tests on the tree — an 80% false
// rate, caused by perTest coverage crediting module-load-scope (`static: true`) mutants to whichever
// unrelated test loaded the module first. Planting is the per-mutant ground truth, and it attributes each
// kill to NAMED tests.
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { budget } from "@orb/tooling/_shared/load-budget";
import { ensureReportsDir, print, REPO_ROOT, reportsRelPath } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { runNicedSync } from "../../_shared/proc.ts";
import type { MutantPopulation, MutantReceipt, ProbeSummary } from "../contract/types.ts";
import { resolveMirrors } from "../lib/mirror.ts";
import { lineStarts, offsetRangeOf } from "../lib/offsets.ts";
import { classifySuiteExit } from "../lib/outcome.ts";
import type { ReportMutant } from "../lib/report.ts";
import { mutantsOf, survivorsOf, totalMutants } from "../lib/report.ts";
import { armStrandGuard, healStranded } from "../lib/stranded.ts";

refuseDirectInvocation(import.meta.url, "pnpm mutation:probe");

/** Matches the standing lane cap — a probe never gets the dedicated-box worker count. */
const MAX_WORKERS = "4";
// A CEILING, load-scaled through the one policy (#1232): the literal is the QUIET-BOX base.
const SUITE_TIMEOUT_MS_BASE = 180_000;
const SUITE_TIMEOUT_MS = budget(SUITE_TIMEOUT_MS_BASE);

interface VitestAssertion {
  readonly status?: string;
  readonly title?: string;
}
interface VitestFile {
  readonly assertionResults?: readonly VitestAssertion[];
}

/** Failing test titles from a vitest json run. `readable: false` distinguishes "the report was not
 *  there" from "the suite named no failing test" — collapsing both to [] would let an unwritten json
 *  read as a kill attributed to nothing, which is the same absent-evidence lie one level down. */
function failedTitles(jsonOut: string): { readonly readable: boolean; readonly titles: readonly string[] } {
  // @orb-gate-ignore caught-failure-ownership(empty:catch): the readable:false verdict IS the return contract — the JSDoc above states this distinguishes "the report was not there" from "the suite named no failing test", so a read/parse failure is reported through the return value, not swallowed. Ends if a caller starts treating readable:false the same as readable:true.
  try {
    const parsed: unknown = JSON.parse(readFileSync(jsonOut, "utf8"));
    const files = (parsed as { readonly testResults?: readonly VitestFile[] }).testResults ?? [];
    return {
      readable: true,
      titles: files.flatMap((f) => (f.assertionResults ?? []).filter((a) => a.status === "failed").map((a) => a.title ?? "<untitled>")),
    };
  } catch {
    return { readable: false, titles: [] };
  }
}

interface SuiteOutcome {
  readonly killed: boolean;
  readonly timedOut: boolean;
  readonly failedTests: readonly string[];
  readonly attributionMissing: boolean;
}

/** Runs the mirror suite once. A non-zero EXIT is a kill — but spawnSync reports a TIMEOUT-killed child as
 *  `status: null`, and `null !== 0` would score an unmeasured hang as a kill, which is the instrument
 *  lying in the direction that hides a real survivor. A null status is its own outcome, never a kill. */
function runMirrorSuite(root: string, specs: readonly string[], jsonOut: string): SuiteOutcome {
  rmSync(jsonOut, { force: true });
  const res = runNicedSync("pnpm", ["test:scoped", ...specs, `--maxWorkers=${MAX_WORKERS}`, "--reporter=json", `--outputFile=${jsonOut}`], {
    cwd: root,
    stdio: "ignore",
    timeout: SUITE_TIMEOUT_MS,
  });
  const verdict = classifySuiteExit(res.status);
  if (verdict === "unmeasured") {
    return { killed: false, timedOut: true, failedTests: [], attributionMissing: false };
  }
  const attribution = failedTitles(jsonOut);
  const killed = verdict === "killed";
  return { killed, timedOut: false, failedTests: attribution.titles, attributionMissing: killed && !attribution.readable };
}

export interface ProbeRange {
  readonly start: number;
  readonly end: number;
}

export interface ProbeOptions {
  readonly reportPath: string;
  readonly sourceRel: string;
  readonly range?: ProbeRange;
  readonly root?: string;
}

interface ReceiptInput {
  readonly index: number;
  readonly mutant: ReportMutant;
  readonly noop: boolean;
  readonly outcome: SuiteOutcome;
  readonly population: MutantPopulation;
}

function receiptFor(input: ReceiptInput): MutantReceipt {
  return {
    population: input.population,
    index: input.index,
    line: input.mutant.location.start.line,
    column: input.mutant.location.start.column,
    mutator: input.mutant.mutatorName,
    noop: input.noop,
    killed: input.outcome.killed,
    timedOut: input.outcome.timedOut,
    failedTests: input.outcome.failedTests,
    attributionMissing: input.outcome.attributionMissing,
  };
}

/** Adjudicate a report's survivor set. Throws (→ exit 2) on drift, an uncovered path, an empty survivor
 *  population, or a source with no runnable mirror suite — each is a broken measurement, not a verdict. */
export function probeMutants(options: ProbeOptions): ProbeSummary {
  const root = options.root ?? REPO_ROOT;
  const sourceAbs = join(root, options.sourceRel);

  // Heal first: a mutation stranded by a previous SIGKILL makes the file dirty, and the pre-flight below
  // would then refuse with "uncommitted changes" — true, but it would send the operator hunting for an
  // edit they never made. Restore it and say so.
  const healed = healStranded(root);
  if (healed !== undefined) {
    print(`mutation-probe: restored ${healed} from a previous run that was killed mid-plant`);
  }

  // PRE-FLIGHT. This tool writes a MUTATED body into a real tracked source file. If that file already
  // carries uncommitted work, two bad things become possible: the operator's WIP is what gets captured
  // as "pristine" and restored over, and a mutation stranded by an earlier hard kill is indistinguishable
  // from a deliberate edit. The repo has already shipped one instrument-probe edit by accident (a gate
  // blinded by a broad `git add` on 2026-08-24); refuse rather than add a second way to do it.
  const dirty = runNicedSync("git", ["status", "--porcelain", "--", options.sourceRel], { cwd: root }).stdout.trim();
  if (dirty !== "") {
    throw new Error(`${options.sourceRel} has uncommitted changes — refusing to plant into a dirty file (commit, stash, or restore it first)`);
  }

  const pristine = readFileSync(sourceAbs, "utf8");
  const survivors = survivorsOf(options.reportPath, options.sourceRel, pristine);

  const specs = resolveMirrors(root, options.sourceRel);
  if (specs.length === 0) {
    throw new Error(
      `no runnable mirror suite exists for ${options.sourceRel} — a probe with no suite kills nothing and would report every mutant as a survivor`,
    );
  }

  const range = options.range;
  // THE POSITIVE CONTROL. A suite that is already red on unmutated source reports EVERY mutant as
  // killed, which reads as a flawless adjudication and is worth nothing. Prove green first or refuse.
  const baseline = runMirrorSuite(root, specs, join(ensureReportsDir(root, "mutation-probe"), "baseline-vitest.json"));
  if (baseline.timedOut) {
    throw new Error(`the mirror suite for ${options.sourceRel} timed out on UNMUTATED source — the probe cannot measure anything against it`);
  }
  if (baseline.killed) {
    throw new Error(
      `the mirror suite for ${options.sourceRel} is RED on unmutated source (${specs.join(" ")}) — every planted mutant would read as killed. Fix the suite before probing.`,
    );
  }

  // NoCoverage joins the planting set. The report claims no test runs those lines; planting proves it.
  // A NoCoverage mutant the suite KILLS refutes the coverage attribution itself, which is a louder
  // finding than a survivor — every score computed over this file rests on that attribution.
  const uncovered = mutantsOf(options.reportPath, options.sourceRel, "NoCoverage");
  const plantable: readonly { readonly mutant: ReportMutant; readonly population: MutantPopulation }[] = [
    ...survivors.map((mutant) => ({ mutant, population: "survived" as const })),
    ...uncovered.map((mutant) => ({ mutant, population: "no-coverage" as const })),
  ];

  const start = range === undefined ? 0 : range.start;
  const end = range === undefined ? plantable.length : Math.min(range.end, plantable.length);
  const outDir = ensureReportsDir(root, "mutation-probe");
  const slug = options.sourceRel.replaceAll("/", "-").replace(/\.tsx?$/u, "");
  const jsonOut = join(outDir, `${slug}-vitest.json`);
  const receiptsPath = join(outDir, `${slug}-${start}-${end}.json`);
  const receipts: MutantReceipt[] = [];

  const starts = lineStarts(pristine);
  const guard = armStrandGuard(root, options.sourceRel, pristine);
  try {
    for (let i = start; i < end; i += 1) {
      const entry = plantable[i];
      if (entry === undefined) {
        continue;
      }
      const { mutant, population } = entry;
      // Validated as a PAIR (offsets.ts): an out-of-line column or an inverted range plants at the wrong
      // byte and reads as a survivor, so it refuses the run rather than producing a receipt.
      const { from, to } = offsetRangeOf(pristine, starts, mutant.location);
      const mutated = pristine.slice(0, from) + mutant.replacement + pristine.slice(to);
      writeFileSync(sourceAbs, mutated);
      receipts.push(receiptFor({ index: i, mutant, noop: mutated === pristine, outcome: runMirrorSuite(root, specs, jsonOut), population }));
    }
  } finally {
    guard.release();
    writeFileSync(receiptsPath, JSON.stringify(receipts, null, 1));
  }
  // Prove the restore actually landed. A mutated source left on the tree is the worst outcome this tool
  // has — it is a silent, plausible-looking logic change in a file nobody is reviewing.
  if (readFileSync(sourceAbs, "utf8") !== pristine) {
    throw new Error(`FAILED TO RESTORE ${options.sourceRel} — it is still MUTATED on disk. Restore it from git before doing anything else.`);
  }

  return {
    sourceRel: options.sourceRel,
    specs,
    reportedSurvivors: survivors.length,
    reportedNoCoverage: uncovered.length,
    reportedTotal: totalMutants(options.reportPath, options.sourceRel),
    measured: receipts.length,
    killed: receipts.filter((r) => r.killed).length,
    stillSurvived: receipts.filter((r) => !(r.killed || r.timedOut)).length,
    timedOut: receipts.filter((r) => r.timedOut).length,
    noopReplacements: receipts.filter((r) => r.noop).length,
    falselyUncovered: receipts.filter((r) => r.population === "no-coverage" && r.killed).length,
    receiptsPath: reportsRelPath("mutation-probe", `${slug}-${start}-${end}.json`),
    receipts,
  };
}
