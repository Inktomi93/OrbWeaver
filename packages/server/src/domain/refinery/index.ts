// refinery/ FRONT DOOR — the only legal external import. The
// card-refinery pipeline: SCORE → REWRITE → ANALYZE over durable per-character sessions, the anti-drift
// invariant (analyze always judges against the session's original-card snapshot), the REGRESSION-bearing
// iterate loop, and the belted per-field apply. Ownership derives through the character join (D23 — no
// ownerId on refinery tables); `characters.*` is written ONLY through injected character ops (F6).

export {
  RefineryOutputBudgetError,
  RefineryRoundInFlightError,
  RefineryRunFailedError,
  RefinerySessionCompletedError,
  RefineryStageNotReadyError,
} from "./contract/errors.ts";
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
  PreviewSchemaPlanParams,
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
export type { ResolveStructuredBinding, SchemaPlanDeps, StructuredBindingDeps } from "./contract/planning.ts";
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
export { applyAsCopyResultSchema, applyFieldsResultSchema, refinerySessionViewSchema } from "./contract/results.ts";
export type { RefineryAssemblyContext as RefineryContext, RefineryService, RefineryWorkloadDeps, ScoreSweep } from "./contract/service.ts";
export { createRefineryService } from "./service.ts";
export { isScoreSweepReady } from "./substrate/refine-prompt.ts";
export { createPlanSchema, createResolveStructuredBinding } from "./verbs/schema-plan.ts";
export { createRefineryWorkloadContributions } from "./workload-contributions.ts";
