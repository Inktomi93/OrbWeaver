// refinery/ FRONT DOOR — the only legal external import (R1 — docs/history/design/refinery-r0.md §9). The
// card-refinery pipeline: SCORE → REWRITE → ANALYZE over durable per-character sessions, the anti-drift
// invariant (analyze always judges against the session's original-card snapshot), the REGRESSION-bearing
// iterate loop, and the belted per-field apply. Ownership derives through the character join (D23 — no
// ownerId on refinery tables); `characters.*` is written ONLY through injected character ops (F6).

export type { RefineryContext } from "./context.ts";
export { RefineryOutputBudgetError, RefineryRoundInFlightError, RefineryRunFailedError, RefineryStageNotReadyError } from "./contract/errors.ts";
export type {
  AcceptedField,
  ApplyAsCopyParams,
  ApplyFieldsParams,
  CreateSchemaParams,
  DeleteSchemaParams,
  DeleteSessionParams,
  GenerateSchemaParams,
  GetSessionParams,
  IterateParams,
  ListRunsParams,
  ListSchemasParams,
  ListSessionsParams,
  PreflightParams,
  RefineSchemaParams,
  RunStageParams,
  ScoreSweepOptions,
  StartSessionParams,
  SubmitManualRewriteParams,
  TestSchemaParams,
  UpdateSchemaParams,
  UpdateSessionParams,
  UpdateSessionPatch,
} from "./contract/params.ts";
export type {
  AppliedFieldKind,
  AppliedFieldRef,
  ApplyAsCopyResult,
  ApplyDropReason,
  ApplyFieldsResult,
  DroppedField,
  IterateResult,
  PreflightResult,
  RefinerySessionView,
  SchemaForgeResult,
  StagePreflight,
} from "./contract/results.ts";
export type { RefineryService, RefineryWorkloadDeps, ScoreSweep } from "./contract/service.ts";
export { createRefineryService } from "./service.ts";
export { SCHEMA_NAME_TAKEN_REASON, SCHEMA_STALE_PATCH_REASON } from "./substrate/schema-library.ts";
export { createScoreSweep } from "./verbs/score-sweep.ts";
export { MANUAL_REWRITE_OUT_OF_SCOPE_REASON } from "./verbs/submit-manual-rewrite.ts";
export { createRefineryWorkloadContributions } from "./workload-contributions.ts";
