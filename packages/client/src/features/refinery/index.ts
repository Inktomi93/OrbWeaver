// refinery/ front door — the FULL R3 section (the founding DECLARED-PLANNED member graduated): the
// section definition + the R2/R3 data tier. Surfaces/components live inside the slice and import
// relatively; the door carries what the composition root and the CT stories enter through (a CT story
// module MUST enter via the `@orb/client/*` alias — a relative import into packages/client/src hands the
// story a DIFFERENT React context instance and mounts blank).

export {} from "./components/accept-review.tsx";

/** exported for the CT story that drives the REAL first-run arm (run null + running → a run lands
 *  with `arrived`) — the composition surface imports it relatively; a story importing it relatively would
 *  mount against a different React context instance (this door's own header). It replaced `StagePane`
 *  when the workbench (program #102, mockup C) stopped rendering one stage at a time. */
export type { PayloadLaneProps } from "./components/payload-lane.tsx";
export { PayloadLane } from "./components/payload-lane.tsx";
export {} from "./components/payload-view.tsx";

export { SchemaEditorDialog } from "./components/schema-editor-dialog.tsx";

export {} from "./components/teaching-state.tsx";
export {} from "./hooks/use-refinery-list-header.tsx";
export {} from "./hooks/use-refinery-mutations.ts";

export {} from "./hooks/use-refinery-schemas.ts";

export {} from "./hooks/use-refinery-sessions.ts";
export {} from "./lib/builtin-hints.ts";
export { refinerySection } from "./lib/refinery-section.tsx";
export {} from "./lib/render-plan.ts";

export {} from "./lib/review-entries.ts";

export {} from "./surfaces/refinery-list-surface.tsx";
