// In-memory run evidence for sibling Snap operations. The public CLI stays numeric; the matrix consumes
// this receipt directly so it never has to re-open a just-written JSON artifact or trust a callback bus.
import type { SettingsShimEvidence } from "../../_shared/appearance.ts";
import type { RuntimeAppearanceHistoricalRow } from "../../_shared/appearance-matrix.ts";
import type { BrowserEnvironmentEvidence } from "../../_shared/browser-environment.ts";
import type { AppearanceInvariantResult } from "./appearance-invariants.ts";
import type { CaptureOutcome } from "./types.ts";
import type { SnapFailureSummary } from "./verdict.ts";

export interface SnapRunReceipt {
  readonly failures: SnapFailureSummary;
  readonly captures: readonly CaptureOutcome[];
  readonly browser: readonly BrowserEnvironmentEvidence[];
  readonly settings: readonly SettingsShimEvidence[];
  readonly appearance: readonly AppearanceInvariantResult[];
  /** Present only for the JSON-owned sequential-checkpoint path. Matrix composition consumes this
   *  in-memory receipt; it never re-opens the per-cell manifest to recover checkpoint truth. */
  readonly scenario: SnapScenarioRunEvidence | null;
}

interface SnapScenarioRunEvidence {
  readonly name: string;
  readonly declaredCheckpointNames: readonly string[];
  readonly capturedCheckpointNames: readonly string[];
  readonly manifestPath: string | null;
}

export interface SnapDetailedPlan {
  readonly appearanceRows: readonly RuntimeAppearanceHistoricalRow[];
}

export interface SnapDetailedResult {
  readonly code: number;
  /** Null only when argv/scenario preparation refused before a browser evidence pass existed. */
  readonly receipt: SnapRunReceipt | null;
}

/** What `finishSession` hands back once a browser is closed: the failure-evidence trace/HAR paths kept
 *  for a red run. Empty for a session call — the browser stays up and a session records none
 *  (docs/design/1208-instrument-substrate.md §10.1). */
export interface FailureArtifacts {
  readonly traces: readonly string[];
  readonly hars: readonly string[];
}

/** A session call's evidence window over the daemon's rings — the scenario's per-checkpoint range shape:
 *  where the session's console/page-error arrays stood when the call began. Null on the one-shot path. */
export interface EvidenceWindow {
  readonly consoleStart: number;
  readonly pageErrorStart: number;
}

/** WHERE one capture pass navigates and what it calls its artifacts — resolved by the host (`snapDestination`
 *  + `artifactFile` for the one-shot path; the daemon for a session call), so `runOnSession` never
 *  re-derives it. */
export interface SessionRunTarget {
  readonly url: string;
  readonly name: string;
  readonly out: string;
  readonly key: string;
  readonly produceShot: boolean;
  /** False for a session call with no route and no --file: drive the page as it stands (`keepLivePage`). */
  readonly navigate: boolean;
}

/** The two seams that differ between the one-shot host and the session daemon — everything else is ONE
 *  implementation (design invariant 4) — plus the matrix's optional appearance plan, which only the
 *  one-shot host (via `--matrix`) ever carries. */
export interface SessionRunHooks {
  readonly window: EvidenceWindow | null;
  /** One-shot: stop traces/HARs and close the browser. Session: keep the browser, no artifacts. */
  readonly finish: (red: boolean) => Promise<FailureArtifacts>;
  readonly detailedPlan?: SnapDetailedPlan;
}
