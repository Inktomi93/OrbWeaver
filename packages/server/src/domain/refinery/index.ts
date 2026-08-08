// refinery/ FRONT DOOR — the only legal external import (R1 — docs/design/refinery-r0.md §9). The
// card-refinery pipeline: SCORE → REWRITE → ANALYZE over durable per-character sessions, the anti-drift
// invariant (analyze always judges against the session's original-card snapshot), the REGRESSION-bearing
// iterate loop, and the belted per-field apply. Ownership derives through the character join (D23 — no
// ownerId on refinery tables); `characters.*` is written ONLY through injected character ops (F6).

export type { RefineryContext } from "./context.ts";
export { RefineryRunFailedError, RefineryStageNotReadyError } from "./contract/errors.ts";
export type {
  AcceptedField,
  ApplyFieldsParams,
  DeleteSessionParams,
  GetSessionParams,
  IterateParams,
  ListRunsParams,
  ListSessionsParams,
  RunStageParams,
  StartSessionParams,
  UpdateSessionParams,
  UpdateSessionPatch,
} from "./contract/params.ts";
export type { AppliedFieldRef, ApplyDropReason, ApplyFieldsResult, DroppedField, IterateResult, RefinerySessionView } from "./contract/results.ts";
export type { RefineryService } from "./contract/service.ts";
export { createRefineryService } from "./service.ts";
