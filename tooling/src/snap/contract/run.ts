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
