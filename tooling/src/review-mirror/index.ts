// review-mirror's programmatic front door. The CLI is the manual D62 milestone entrypoint; tests and any
// future reviewer orchestration consume this surface instead of reaching into ops/lib files.
export type {
  MirrorSummary,
  PendingGuardCensus,
  PendingGuardClassification,
  PendingGuardReceipt,
  ResolvedReviewFocus,
  ReviewFocus,
  ReviewMirrorEvidence,
} from "./contract/types.ts";
export { assertReviewEvidence, reviewEvidenceGaps } from "./lib/evidence.ts";
export { REVIEW_FOCUS, resolveReviewFocus } from "./lib/focus.ts";
export { stripComments, stripperFor } from "./lib/strip.ts";
export { censusPendingGuards } from "./ops/pending-guard.ts";
export type { RunReviewMirrorOptions, RunReviewMirrorResult } from "./ops/run.ts";
export { runReviewMirror } from "./ops/run.ts";
