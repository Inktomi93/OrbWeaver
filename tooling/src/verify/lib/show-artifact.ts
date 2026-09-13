// `check:show`'s ARTIFACT LAYER: the view shapes `reports/check-structure.json` is read through, the read
// itself, and the three refusals that decide whether the artifact is consumable AT ALL — split out of
// ops/show.ts, which sits at the tooling line cap (#2247). Its sibling lib/show-policy.ts owns the FINAL-side
// renderers; together they leave ops/show.ts holding argv, filtering and the console write.
//
// WHY THE VIEW SHAPES ARE HERE AND NOT IN contract/: they are not the artifact's contract — that is
// contract/structure-report.ts, which the WRITER is bound by. These are the reader's OWN narrower, mostly
// OPTIONAL projections of it, and the optionality is the whole point: this view also reads artifacts written
// before #410, before #569, before #946, before #1029 and before the mixed runtime, so a field the writer now
// always emits is still `?` here. Tightening one to match the writer would make this reader throw on exactly
// the old artifact it exists to stay able to read.
//
// COLOUR ARRIVES FROM THE CALLER (`ShowInk`, lib/show-policy.ts) so this file owns no TTY detection — same
// contract its sibling already keeps.
import { readFileSync } from "node:fs";
import { abandonedRuns, reportsPath } from "@orb/tooling/_shared/artifacts";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { FinalPolicyRow, StructurePolicyReport } from "../contract/structure-report.ts";
import { STRUCTURE_REPORT_NAME } from "../contract/structure-report.ts";
import type { ShowInk } from "./show-policy.ts";
import { finalBrokenEvidenceCount } from "./show-policy.ts";

/** The run-slot family this view reads (`reports/runs/<instrument>/…`, #1029). */
const INSTRUMENT = "structure";

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly message: string;
  /** Present on a FINAL row's findings (mixed runtime, #1584); absent on legacy rows and pre-mixed artifacts. */
  readonly column?: number;
  readonly token?: string;
  readonly severity?: "error" | "warning";
}
/** Optional: absent in pre-2026-08-13 artifacts (pass.ts `GateScan`). */
export interface GateScanView {
  readonly candidates: number;
  readonly scanned: number;
  readonly admitted: number;
  /** The RATIFIED subset of `admitted` (#569). Absent in pre-#569 artifacts — read as 0, which renders the
   *  whole admission as debt: the honest reading of an artifact written before the class existed. */
  readonly admittedRatified?: number;
  readonly declared?: { readonly unit: string; readonly candidates: number; readonly scanned: number };
}
/** A LEGACY row (`contract` absent on a pre-mixed artifact — read as legacy). */
export interface LegacyGateView {
  readonly contract?: "legacy";
  readonly name: string;
  readonly ok: boolean;
  readonly violations: readonly Violation[];
  readonly scan?: GateScanView;
}
/** ONE roster, two contracts (mixed runtime, #1584): a final row is the writer's own shape, never a loose view —
 *  the mixed writer is the only writer that emits it. */
export type GateReport = LegacyGateView | FinalPolicyRow;

export function isFinalRow(g: GateReport): g is FinalPolicyRow {
  return g.contract === "final";
}
/** The run manifest (#410). OPTIONAL here on purpose: this view also reads artifacts written before the
 *  manifest existed, and a MISSING manifest is a pre-#410 artifact (readable), while a manifest that says
 *  `complete: false` is a run that DIED (refused). The two are not the same fact. */
export interface RunManifestView {
  readonly runId: string;
  readonly complete: boolean;
  readonly ran: number;
  readonly active: number;
  readonly incompleteReasons?: readonly string[];
  /** Absent in pre-#2167 artifacts, which is why the refusal below treats `undefined` as consumable: an older
   *  artifact predates the axis and cannot be judged on it. A `"non-verdict"` is refused with its reason. */
  readonly verdict?: "verdict" | "non-verdict";
  readonly nonVerdictReason?: string | null;
  /** Absent in pre-#1029 artifacts: the run's own slot and when it started. */
  readonly startedAt?: string;
  readonly artifactDir?: string;
}
/** One refused MEMBER-population receipt (#946), as written into the artifact by ops/structure.ts. */
export interface PopulationAlarmView {
  readonly gate: string;
  readonly source: string;
  readonly reason: string;
  readonly members: number;
  readonly unresolved: number;
}
export interface StructureReport {
  readonly run?: RunManifestView;
  readonly gates: readonly GateReport[];
  /** Optional: absent in pre-2026-08-03 artifacts. A gate that THREW (exit 2) — without rendering
   *  these, an ok:false report with zero violations displayed as inexplicably empty. */
  readonly toolErrors?: readonly { readonly gate: string; readonly phase: string; readonly message: string }[];
  /** Optional: absent in pre-2026-08-13 artifacts. Gates that ran and read NOTHING — rendered here for the
   *  same reason toolErrors are: this view is where the doctrine says to LOOK, so a signal missing here is
   *  a signal nobody sees. */
  readonly scanAlarms?: readonly string[];
  /** Optional: absent in pre-#946 artifacts. A coverage gate whose declared MEMBER population came back
   *  empty or left declarations unresolved — read here for the same reason as `scanAlarms`: this view is
   *  where the doctrine says to LOOK, so a signal missing here is a signal nobody sees. */
  readonly populationAlarms?: readonly PopulationAlarmView[];
  /** Optional: absent in pre-mixed artifacts; null when the corpus held no final policy. The final side's
   *  refusals/alarms live here and are rendered beside the legacy tool errors for the same read-here reason. */
  readonly policy?: StructurePolicyReport | null;
  readonly total: number;
  readonly ok: boolean;
}

/** How a run identifies itself to a reader: the id, and the slot it wrote when it carries one. */
export function describeRun(run: RunManifestView | undefined): string {
  if (run === undefined) {
    return "<pre-#410 artifact — no run manifest>";
  }
  return run.artifactDir === undefined ? run.runId : `${run.runId} → ${run.artifactDir}`;
}

/** The misuse text for "there is no artifact here at all" — ONE spelling, raised both by the read below and
 *  by the caller's own null branch, so the two can never drift into two different instructions. */
export function missingReportRefusal(root: string): string {
  return `check:show — couldn't read ${reportsPath(root, STRUCTURE_REPORT_NAME)}\n  Run \`pnpm check:structure\` first to generate it.`;
}

export function readReport(root: string): StructureReport | null {
  const path = reportsPath(root, STRUCTURE_REPORT_NAME);
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    // A missing pointer with a DEAD run behind it is a killed run, not misuse — the caller checks
    // `abandonedRuns` first and only falls through to this when nothing ran here at all.
    if (abandonedRuns(root, INSTRUMENT).length > 0) {
      return null;
    }
    // A missing report is MISUSE (3): run `pnpm check:structure` first to generate it.
    throw new UsageError(missingReportRefusal(root), { cause: err });
  }
  return JSON.parse(raw) as StructureReport;
}

/** #410 AFTER #1029 — the killed-run refusal, re-rooted. The in-flight stub no longer sits at the fixed
 *  path (concurrent runs clobbered it; that was the defect #1029 closed), so the tell a fixed-path reader
 *  needs is an ABANDONED SLOT: an in-flight marker whose pid is gone. One is refused whenever it is NEWER
 *  than the run the pointer resolves to — that is exactly "your last run died and you are about to read
 *  somebody else's (or an older) verdict as its result". A LIVE sibling run is deliberately not a refusal:
 *  it has not died, and the pointer it will publish is still a complete verdict. */
export function refuseAbandoned(root: string, report: StructureReport | null, ink: ShowInk): string | null {
  const dead = abandonedRuns(root, INSTRUMENT)[0];
  if (dead === undefined) {
    return null;
  }
  const publishedAt = report?.run?.startedAt;
  if (publishedAt !== undefined && publishedAt >= dead.startedAt) {
    return null; // a later run finished after that death — the pointer is the newer fact
  }
  return ink.red(
    `✗ reports/${STRUCTURE_REPORT_NAME} is NOT a verdict for this checkout's last run (run ${dead.runId})\n` +
      `      ‼ that run never finished — it left the IN-FLIGHT stub at ${dead.dir}/${STRUCTURE_REPORT_NAME}; it was killed, OOM-aborted or timed out\n` +
      `      ‼ ${report === null ? "no completed run has published a pointer here at all" : `the pointer resolves to the OLDER run ${describeRun(report.run)}`}\n` +
      "      Re-run `pnpm check:structure`. See tooling/src/verify/contract/run-manifest.ts (#410/#1029).",
  );
}

/** #410: an artifact whose run did not finish (or did not reconcile) is NOT a verdict at any exit code —
 *  it is either the in-flight stub a killed run left behind, or a pass that ran fewer gates than the corpus
 *  holds. Returns the operator line to print, or null when the artifact is consumable. */
export function refuseIncomplete(report: StructureReport, ink: ShowInk): string | null {
  const run = report.run;
  if (run === undefined) {
    return null; // a pre-#410 artifact carries no manifest — readable, just older
  }
  // #2167: a run can FINISH and still not be a statement about the real tree — a fixture-mode run, a run that
  // observed a planter's paths, or a slot an operator tombstoned. That axis is `verdict`, not `complete`; the
  // two are orthogonal and this is the only reader that must not collapse them.
  if (run.verdict === "non-verdict") {
    return ink.red(
      `✗ reports/${STRUCTURE_REPORT_NAME} is NOT a verdict about the real tree (run ${run.runId})\n` +
        `      ‼ ${run.nonVerdictReason ?? "this run was marked a non-verdict and recorded no reason — treat it as unusable"}\n` +
        "      Do not derive real-tree facts from it. Re-run `pnpm check:structure`. See tooling/src/verify/contract/run-manifest.ts (#2167).",
    );
  }
  if (run.complete && (run.incompleteReasons ?? []).length === 0) {
    return null;
  }
  const why = run.complete
    ? (run.incompleteReasons ?? []).map((r) => `      ‼ ${r}`).join("\n")
    : `      ‼ the run never finished — this is the IN-FLIGHT stub (ran ${run.ran}/${run.active}); it was killed, OOM-aborted or timed out`;
  return ink.red(
    `✗ reports/${STRUCTURE_REPORT_NAME} is NOT a verdict (run ${run.runId})\n${why}\n` +
      "      Re-run `pnpm check:structure`. See tooling/src/verify/contract/run-manifest.ts (#410).",
  );
}

/** The member-population refusal, in the artifact reader's voice (the runner's own spelling lives at
 *  lib/pass.ts `populationAlarmLine`; this view reads a JSON row, not a typed alarm). */
export function populationAlarmText(a: PopulationAlarmView): string {
  if (a.reason === "empty") {
    return `population "${a.source}" resolved ZERO members — the gate's subject derivation came back empty, so its verdict is a placebo (GATE-AUTHORING.md §1).`;
  }
  return `population "${a.source}" left ${a.unresolved} declaration(s) UNRESOLVED beside ${a.members} member(s) — the denominator silently shrank (GATE-AUTHORING.md §1).`;
}

/** How many "the run is not a verdict" signals the artifact carries — thrown gates, blind gates, refused
 *  populations. ONE spelling, so the header, the exit code and the pass line can never disagree. */
export function brokenEvidenceCount(report: StructureReport): number {
  return (report.toolErrors?.length ?? 0) + (report.scanAlarms?.length ?? 0) + (report.populationAlarms?.length ?? 0) + finalBrokenEvidenceCount(report.policy);
}
