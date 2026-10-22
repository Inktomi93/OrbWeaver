// refinery/ FRONT DOOR — the only legal external import. The
// card-refinery pipeline: SCORE → REWRITE → ANALYZE over durable per-character sessions, the anti-drift
// invariant (analyze always judges against the session's original-card snapshot), the REGRESSION-bearing
// iterate loop, and the belted per-field apply. Ownership derives through the character join (D23 — no
// ownerId on refinery tables); `characters.*` is written ONLY through injected character ops (F6).

export type { ResolveStructuredBinding } from "./contract/planning.ts";

export type { RefineryAssemblyContext as RefineryContext, RefineryService, RefineryWorkloadDeps } from "./contract/service.ts";
export { createRefineryService } from "./service.ts";
export { isScoreSweepReady } from "./substrate/refine-prompt.ts";
export { createPlanSchema, createResolveStructuredBinding } from "./verbs/schema-plan.ts";
export { createRefineryWorkloadContributions } from "./workload-contributions.ts";
