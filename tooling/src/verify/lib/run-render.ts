// `verify`'s CONSOLE presentation — the TRUNCATION-ROBUST output contract: a reader who sees only the
// first ~15 lines (the head banner) OR only the last ~15 lines (the tail block) can determine PASS/FAIL
// and that reports/verify.json is authoritative. Split out of ops/run.ts at the @orb/tooling P6 move (size
// cap §4.3). The NO-VERDICT block (#2225) is the one addition since that move: a stage that RAN and
// measured nothing is NAMED above the verdict line, because the failure count alone cannot tell a
// broken instrument from a real red.
import process from "node:process";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { StageResult, Tier, VerifyReport } from "../contract/stage.ts";
import { RUNNABLE_VERIFY_TIERS } from "../contract/stage.ts";
import { producedNoVerdict } from "./exit-classifiers.ts";
import { manualStages, stagesForTier } from "./registry.ts";

const NAME_PAD = 20; // stage-name column width in `verify --list`.
/** The tool-error glyph, shared by `stageMark` and the NO-VERDICT block so one class reads one way. */
const NO_VERDICT_MARK = "\u203c";

function stageMark(r: StageResult): string {
  if (r.mode === "deferred") {
    return "→";
  }
  if (r.mode === "skipped") {
    return "·";
  }
  if (r.ok) {
    return "✓";
  }
  return r.exitCode === EXIT.toolError ? NO_VERDICT_MARK : "✗";
}

export function stageLine(r: StageResult): string {
  if (r.mode === "deferred") {
    return `${stageMark(r)} ${r.name}  deferred (whole-only at this scope) — runs at ${r.runsAt}`;
  }
  if (r.mode === "skipped") {
    // TWO REASONS SHARE THE `skipped` MODE and they are not interchangeable (#1566). A SCOPED skip means
    // the selection held no relevant file; a TIER-PRECONDITION skip means the stage belongs to this tier
    // conditionally and the condition did not hold — a whole-tier run, where "no files in scope" is
    // simply false. `runsAt` is what tells them apart (a scoped skip carries none) and it must reach the
    // CONSOLE, not just verify.json: the reader deciding whether their push was really covered is looking
    // at this line.
    return r.runsAt === null
      ? `${stageMark(r)} ${r.name}  skipped (no files in scope)`
      : `${stageMark(r)} ${r.name}  skipped — tier precondition not met; runs at ${r.runsAt}`;
  }
  const scope = r.mode === "scoped" ? " scoped" : "";
  const tag = !r.ok && r.exitCode === EXIT.toolError ? " [tool-error]" : "";
  return `${stageMark(r)} ${r.name} (${r.durationMs}ms)${scope}${tag}`;
}

const FAIL_KIND: Readonly<Record<number, string>> = {
  [EXIT.toolError]: "TOOL-ERROR",
  [EXIT.misuse]: "REFUSED (strict-scope)",
  [EXIT.violations]: "violations",
};

/** A one-line failure reason for a stage — the classifier verdict + its log path, for the tail block. The
 *  glyph is `stageMark` (‼ for a tool-error, ✗ for a violation) so a tool-error (exit 2 — a BROKEN checker,
 *  never a verdict per the §3.3 exit contract) is never presented with the violations glyph. Exported for
 *  the presentation unit test. */
export function failReason(r: StageResult): string {
  const kind = FAIL_KIND[r.exitCode] ?? "violations";
  const where = r.logFile ?? "(no log — did not run)";
  return `  ${stageMark(r)} ${r.name} — ${kind} · ${where}`;
}

/** Print-order rank for the FAIL block: a TOOL ERROR first, then a strict-scope refusal, then violations.
 *  #2225 — a stage that exited 2 produced NO VERDICT, so the tier's coverage is a claim that did not hold;
 *  a reader who scans only the first failing line must meet that before a lint finding. It is the same
 *  severity order `aggregateExit` already uses for the run's own exit; this makes the CONSOLE agree.
 *
 *  THIS SORTS WHAT IS PRINTED, NEVER WHAT IS RECORDED. `report.stages` stays in registry order because the
 *  artifact is read by other instruments and by later runs; the summary is read by a human scanning for
 *  what broke. A reporter may reorder its presentation and must never reorder the record. */
const VIOLATIONS_RANK = 2;
const FAIL_RANK: Readonly<Record<number, number>> = { [EXIT.toolError]: 0, [EXIT.misuse]: 1, [EXIT.violations]: VIOLATIONS_RANK };

/** The FAIL block's stages, worst first — a stable sort, so rows of equal severity keep registry order. */
export function failuresWorstFirst(stages: readonly StageResult[]): readonly StageResult[] {
  return [...stages.filter((s) => !s.ok)].sort((a, b) => (FAIL_RANK[a.exitCode] ?? VIOLATIONS_RANK) - (FAIL_RANK[b.exitCode] ?? VIOLATIONS_RANK));
}

/** The NOTICES block — lines a PASSING stage needs seen (contract/stage.ts `notices`). It prints INSIDE
 *  the tail region, above the verdict, because that is the part of the output a reader (or a truncating
 *  terminal) actually keeps. A notice never touches the verdict: `verify` can print a notice and still say
 *  PASS, which is the whole point — the alternative is the log line nobody reads (#534/#533). */
function printNotices(report: VerifyReport): void {
  const noticed = report.stages.filter((s) => s.notices.length > 0);
  if (noticed.length === 0) {
    return;
  }
  process.stdout.write("\n──────────────────────────── NOTICES (not failures) ────────────────────────────\n");
  for (const stage of noticed) {
    for (const notice of stage.notices) {
      process.stdout.write(`  ! ${stage.name}: ${notice}\n`);
    }
  }
}

/** THE NO-VERDICT BLOCK — every stage that RAN and measured nothing, named, ABOVE the red count (#2225).
 *
 *  #2220 is what its absence costs: `lint:hook-syntax` exited 2 on every static run for a day, the
 *  aggregate exit was 2 the whole time, and the CAUSE was found by opening a per-stage log — because the
 *  only number the summary offered was "N stage(s) failed", which lumps "nothing was measured" together
 *  with "your code has a lint finding". A reader who meets the count first goes hunting for a violation
 *  that does not exist.
 *
 *  IT PRINTS BEFORE THE VERDICT LINE, INSIDE THE TRUNCATION-ROBUST TAIL, and it prints even when the run
 *  is otherwise green — a green verdict over an unmeasured stage is exactly the claim that did not hold.
 *  `failuresWorstFirst` already sorts these to the top of the FAIL list; that is the ORDER of a list the
 *  reader still has to interpret, and this is the list itself. */
function printNoVerdict(report: VerifyReport): void {
  const unmeasured = report.stages.filter(producedNoVerdict);
  if (unmeasured.length === 0) {
    return;
  }
  process.stdout.write(`[verify] NO VERDICT: ${unmeasured.length} stage(s) RAN AND MEASURED NOTHING — this run does not cover them:\n`);
  for (const stage of unmeasured) {
    // The child's raw exit is named beside the class: "killed / never spawned" and "the tool exited 2" are
    // different repairs, and the artifact keeps both (`StageResult.childExit`).
    const child =
      stage.childExit === null ? "child reported NO exit (killed, timed out, or never spawned)" : `child exit ${String(stage.childExit ?? "unrecorded")}`;
    process.stdout.write(`  ${NO_VERDICT_MARK} ${stage.name} — ${child} \u00b7 ${stage.logFile ?? "(no log — did not run)"}\n`);
  }
  process.stdout.write(
    "[verify] A stage that produced no verdict makes the tier's coverage a claim that did not hold — read these BEFORE the failure count.\n",
  );
}

/** The TAIL block — the load-bearing truncation-robust output. A reader who sees ONLY the last ~15 lines
 *  MUST be able to determine PASS/FAIL, which stages failed, and that reports/verify.json is authoritative.
 *  The verdict + pointer print on BOTH pass and fail; on fail, every failing stage names its log inline. */
export function printSummary(report: VerifyReport): void {
  process.stdout.write(`\n=== verify summary (tier: ${report.tier}, scope: ${report.scope}) ===\n`);
  for (const r of report.stages) {
    process.stdout.write(`${stageLine(r)}\n`);
  }
  const failed = failuresWorstFirst(report.stages);
  printNotices(report);
  process.stdout.write("\n════════════════════════════════════════════════════════════════════\n");
  printNoVerdict(report);
  if (report.ok) {
    process.stdout.write("[verify] VERDICT: PASS (exit 0) — all stages clean\n");
  } else {
    process.stdout.write(`[verify] VERDICT: FAIL (exit ${report.exitCode}) — ${failed.length} stage(s) failed:\n`);
    for (const r of failed) {
      process.stdout.write(`${failReason(r)}\n`);
    }
  }
  // The pointer is printed on BOTH pass and fail — a tailing reader always lands on where to read next.
  process.stdout.write("[verify] AUTHORITATIVE RESULT → reports/verify.json · per-stage logs → reports/verify/<stage>.log\n");
  process.stdout.write("════════════════════════════════════════════════════════════════════\n");
}

export function printList(): void {
  process.stdout.write("verify — the stage registry (tiers · scope):\n\n");
  for (const t of RUNNABLE_VERIFY_TIERS) {
    process.stdout.write(`  ${t}:\n`);
    for (const s of stagesForTier(t)) {
      const scoped = s.scopedArgv === undefined ? "whole-only" : "scopable";
      // A CONDITIONAL rung states its condition HERE (#1523) — the tier ladder is read from this listing
      // (`--list` is the one home for tier membership), so a row that sometimes does not run at a tier it
      // is listed under would make the listing a half-truth.
      const precondition = s.tierPrecondition;
      const conditional = precondition !== undefined && precondition.tiers.includes(t) ? ` · CONDITIONAL: runs when ${precondition.reason}` : "";
      process.stdout.write(`    · ${s.name.padEnd(NAME_PAD)} [${s.group}] ${scoped}${conditional}\n`);
    }
  }
  process.stdout.write("\n  manual (never auto-run):\n");
  for (const s of manualStages()) {
    process.stdout.write(`    · ${s.name.padEnd(NAME_PAD)} — ${s.manualReason ?? "(no reason given)"}\n`);
  }
}

/** The HEAD banner — printed before any stage runs, so a reader who sees ONLY the first ~15 lines learns
 *  (a) a verify run is in progress + its tier/scope, and (b) that the authoritative result is
 *  reports/verify.json + reports/verify/<stage>.log. The verdict itself lands in the TAIL block. */
export function printHeadBanner(tier: Tier, scope: string): void {
  process.stdout.write(
    [
      "════════════════════════════════════════════════════════════════════",
      `[verify] RUNNING · tier=${tier} · scope=${scope}`,
      "[verify] AUTHORITATIVE RESULT → reports/verify.json (read this file — it has the verdict,",
      "[verify]   per-stage status, and a failure excerpt) · per-stage logs → reports/verify/<stage>.log",
      "[verify] verdict + failing stages are repeated at the TAIL of this output.",
      "════════════════════════════════════════════════════════════════════",
      "",
    ].join("\n"),
  );
}
