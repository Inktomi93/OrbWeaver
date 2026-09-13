// `check:show` reads current and historical structure artifacts through this reader-view contract. These
// shapes remain more optional than the writer contract because old artifacts predate current fields.
import type { FinalPolicyRow, StructureCountReconciliation, StructurePolicyReport } from "./structure-report.ts";

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
   * whole admission as debt: the honest reading of an artifact written before the class existed. */
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
 * the mixed writer is the only writer that emits it. */
export type GateReport = LegacyGateView | FinalPolicyRow;

/** The run manifest (#410). OPTIONAL here on purpose: this view also reads artifacts written before the
 * manifest existed, and a MISSING manifest is a pre-#410 artifact (readable), while a manifest that says
 * `complete: false` is a run that DIED (refused). The two are not the same fact. */
export interface RunManifestView {
  readonly runId: string;
  readonly complete: boolean;
  readonly ran: number;
  readonly active: number;
  readonly incompleteReasons?: readonly string[];
  /** Absent in pre-#2167 artifacts, which is why the refusal treats `undefined` as consumable: an older
   * artifact predates the axis and cannot be judged on it. A `"non-verdict"` is refused with its reason. */
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
   * these, an ok:false report with zero violations displayed as inexplicably empty. */
  readonly toolErrors?: readonly { readonly gate: string; readonly phase: string; readonly message: string }[];
  /** Optional: absent in pre-2026-08-13 artifacts. Gates that ran and read NOTHING — rendered here for the
   * same reason toolErrors are: this view is where the doctrine says to LOOK, so a signal missing here is
   * a signal nobody sees. */
  readonly scanAlarms?: readonly string[];
  /** Optional: absent in pre-#946 artifacts. A coverage gate whose declared MEMBER population came back
   * empty or left declarations unresolved — read here for the same reason as `scanAlarms`: this view is
   * where the doctrine says to LOOK, so a signal missing here is a signal nobody sees. */
  readonly populationAlarms?: readonly PopulationAlarmView[];
  /** Optional: absent in pre-mixed artifacts; null when the corpus held no final policy. The final side's
   * refusals/alarms live here and are rendered beside the legacy tool errors for the same read-here reason. */
  readonly policy?: StructurePolicyReport | null;
  /** Absent on pre-#2276 artifacts. When present, this is the writer's explicit arithmetic behind `total`. */
  readonly reconciliation?: StructureCountReconciliation;
  readonly total: number;
  readonly ok: boolean;
}
