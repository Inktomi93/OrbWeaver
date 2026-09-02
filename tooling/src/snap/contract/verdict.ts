// Snap's diff/verdict result shapes. They are split from the argv-heavy Args contract so adding one
// instrument cannot push the shared public type door back over the tooling-size cap.
import type { ResultPair } from "../../_shared/artifacts.ts";

export interface DiffOutcome {
  readonly diffPairs: ResultPair[];
  readonly ssimFailed: boolean;
}

export interface SnapFailureSummary {
  readonly navigation: number;
  readonly navActions: number;
  readonly pageErrors: number;
  readonly failedRequests: number;
  readonly steps: number;
  readonly contrast: number;
  readonly aria: number;
  readonly map: number;
  readonly eval: number;
  readonly watch: number;
  readonly diff: number;
  readonly assertions: number;
  readonly consoleErrors: number;
  readonly consoleWarnings: number;
  readonly css: number;
  readonly deadCss: number;
  readonly emptyCss: number;
  /** Requested/applied browser identity disagreed with live viewport/device/pointer/media evidence. */
  readonly environment: number;
  /** Matrix-owned historical appearance invariants that were violated or instrument-blind. */
  readonly appearance: number;
  /** `--lighthouse` audits that FAILED. A finding is a verdict member here for the same reason dead CSS
   *  and contrast are: the arm is opt-in, so a green exit over the a11y failures the caller asked
   *  Lighthouse to find would be a false ship receipt. A REFUSED audit is not counted here at all — it
   *  exits 2 through the evidence-gap door instead (tooling/src/snap/ops/lighthouse.ts). */
  readonly lighthouse: number;
}
