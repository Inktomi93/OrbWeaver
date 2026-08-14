// refinery/ front door — the FULL R3 section (the founding DECLARED-PLANNED member graduated): the
// section definition + the R2/R3 data tier. Surfaces/components live inside the slice and import
// relatively; the door carries what the composition root and the CT stories enter through (a CT story
// module MUST enter via the `@orb/client/*` alias — a relative import into packages/client/src hands the
// story a DIFFERENT React context instance and mounts blank).

export { AcceptReview } from "./components/accept-review.tsx";
export { PayloadView } from "./components/payload-view.tsx";
/** @public exported for the CT that proves the Setup tab reaches BOTH schema verbs the live drive found
 *  UI-unreachable — authoring a custom ANALYZE schema and EDITING a saved one (2026-08-14). `refinerySection`
 *  mounts it relatively in the CONTEXT panel; a story importing it relatively would mount against a different
 *  React context instance (this door's own header). */
export { SetupTabBody } from "./components/refinery-context-tabs.tsx";
/** @public exported for the narrow-container CT that proves the fit-line no longer paints through the verb
 *  cluster (side-eye 2026-08-09 P1) — the composition surface imports it relatively. */
export type { RunControlsCardProps } from "./components/run-controls-card.tsx";
export { RunControlsCard } from "./components/run-controls-card.tsx";
export { SchemaEditorDialog } from "./components/schema-editor-dialog.tsx";
/** @public exported for the CT that proves the scope image RE-SEEDS on every open (a server-side
 *  `applyFields` remap used to be invisible to a permanently-mounted dialog) — both composition sites
 *  import it relatively, and a story importing it relatively would mount against a different React
 *  context instance (this door's own header). */
export { ScopeEditorDialog } from "./components/scope-editor-dialog.tsx";
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
/** @public exported for the routed CT that mounts the LIVE content workflow whole (load → view-back → a
 *  per-block rewrite decision → apply → the terminal outcome) — `refinerySection` imports it relatively,
 *  and a story importing it relatively would mount against a different React context instance (header). */
export { RefineryContentSurface } from "./surfaces/refinery-content-surface.tsx";
export { RefineryListHeader, RefineryListSurface } from "./surfaces/refinery-list-surface.tsx";
