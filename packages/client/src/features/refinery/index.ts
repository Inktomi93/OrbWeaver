// refinery/ front door — the FULL R3 section (the founding DECLARED-PLANNED member graduated): the
// section definition + the R2/R3 data tier. Surfaces/components live inside the slice and import
// relatively; the door carries what the composition root and the CT stories enter through (a CT story
// module MUST enter via the `@orb/client/*` alias — a relative import into packages/client/src hands the
// story a DIFFERENT React context instance and mounts blank).

export { AcceptReview } from "./components/accept-review.tsx";
export { PayloadView } from "./components/payload-view.tsx";
export { SchemaEditorDialog } from "./components/schema-editor-dialog.tsx";
/** @public exported for the CT story that drives the REAL first-run arm (run null + running → a run lands
 *  with `arrived`) — the composition surface imports it relatively; a story importing it relatively would
 *  mount against a different React context instance (this door's own header). */
export type { StagePaneProps } from "./components/stage-pane.tsx";
export { StagePane } from "./components/stage-pane.tsx";
export type { StageCell } from "./components/stage-stepper.tsx";
export { StageStepper } from "./components/stage-stepper.tsx";
export { TeachingState } from "./components/teaching-state.tsx";
export {
  useApplyRefineryAsCopy,
  useApplyRefineryFields,
  useDeleteRefinerySession,
  useIterateRefinery,
  useRunRefineryStage,
  useStartRefinerySession,
  useSubmitManualRewrite,
  useUpdateRefinerySession,
} from "./hooks/use-refinery-mutations.ts";
export {
  useCreateRefinerySchema,
  useDeleteRefinerySchema,
  useGenerateRefinerySchema,
  useRefineRefinerySchema,
  useRefineryPreflight,
  useRefinerySchemas,
  useTestRefinerySchema,
  useUpdateRefinerySchema,
} from "./hooks/use-refinery-schemas.ts";
export { useRefineryRuns, useRefinerySession, useRefinerySessions } from "./hooks/use-refinery-sessions.ts";
export { BUILTIN_STAGE_HINTS } from "./lib/builtin-hints.ts";
export { refinerySection } from "./lib/refinery-section.tsx";
export type { HintOverlay, PlanField, RenderPlan } from "./lib/render-plan.ts";
export { buildRenderPlan, formatLabel } from "./lib/render-plan.ts";
export type { ReviewEntry } from "./lib/review-entries.ts";
export { reviewEntriesOf } from "./lib/review-entries.ts";
export { RefineryListHeader, RefineryListSurface } from "./surfaces/refinery-list-surface.tsx";
