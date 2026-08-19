// refinery/ front door — the FULL R3 section (the founding DECLARED-PLANNED member graduated): the
// section definition + the R2/R3 data tier. Surfaces/components live inside the slice and import
// relatively; the door carries what the composition root and the CT stories enter through (a CT story
// module MUST enter via the `@orb/client/*` alias — a relative import into packages/client/src hands the
// story a DIFFERENT React context instance and mounts blank).

export { AcceptReview } from "./components/accept-review.tsx";
/** @public exported for the CT that carries the lane's RUNNING affordance contract — the indeterminate
 *  hairline whose reduced-motion arm REMOVES the travelling segment rather than parking it (migrated from
 *  the deleted stage stepper's CT) — plus the fit-line/verb geometry at a rail width. The lanes receive it
 *  as a composed node from the surface, so a story has to mount it directly. */
export type { LaneRunControlProps } from "./components/lane-run-control.tsx";
export { LaneRunControl } from "./components/lane-run-control.tsx";
/** @public exported for the CT story that drives the REAL first-run arm (run null + running → a run lands
 *  with `arrived`) — the composition surface imports it relatively; a story importing it relatively would
 *  mount against a different React context instance (this door's own header). It replaced `StagePane`
 *  when the workbench (program #102, mockup C) stopped rendering one stage at a time. */
export type { PayloadLaneProps } from "./components/payload-lane.tsx";
export { PayloadLane } from "./components/payload-lane.tsx";
export { PayloadView } from "./components/payload-view.tsx";
/** @public exported for the CT that proves the Setup tab reaches BOTH schema verbs the live drive found
 *  UI-unreachable — authoring a custom ANALYZE schema and EDITING a saved one (2026-08-14). `refinerySection`
 *  mounts it relatively in the CONTEXT panel; a story importing it relatively would mount against a different
 *  React context instance (this door's own header). */
/** @public exported for the CT that pins the WEIGHT of the ledger's own "Run score" — the twin of the
 *  SCORE lane's verb one pane over (§14: bolder in the work pane, quieter in the ledger; side-eye
 *  2026-08-19 P1-4). It is a rendered fact with no other mount: the CONTENT surface's census cannot see a
 *  control that lives in the CONTEXT panel. */
export { RunsTabBody, SetupTabBody } from "./components/refinery-context-tabs.tsx";
/** @public exported for the CT that drives the REWRITE island's accept anatomy — the focal field, the
 *  queue, the tally and the running/not-run arms — as the composition surface mounts it. */
export type { RewriteLaneProps } from "./components/rewrite-lane.tsx";
export { RewriteLane } from "./components/rewrite-lane.tsx";
/** @public exported for the narrow-container CT that proves the foot run bar's guidance field and its verb
 *  cluster never share one line's slack (side-eye 2026-08-09 P1-2) — the composition surface imports it
 *  relatively. */
export type { RunControlsCardProps } from "./components/run-controls-card.tsx";
export { RunControlsCard } from "./components/run-controls-card.tsx";
export { SchemaEditorDialog } from "./components/schema-editor-dialog.tsx";
/** @public exported for the CT that proves the scope image RE-SEEDS on every open (a server-side
 *  `applyFields` remap used to be invisible to a permanently-mounted dialog) — both composition sites
 *  import it relatively, and a story importing it relatively would mount against a different React
 *  context instance (this door's own header). */
export { ScopeEditorDialog } from "./components/scope-editor-dialog.tsx";
export { TeachingState } from "./components/teaching-state.tsx";
export {
  useApplyRefineryAsCopy,
  useApplyRefineryFields,
  useDeleteRefinerySession,
  useIterateRefinery,
  useRunRefineryStage,
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
