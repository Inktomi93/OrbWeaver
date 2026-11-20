// mutation-run's front door: the runs the cli fronts, and the pure checks under `tests/tooling/mutation-run/lib/`.
export type { HotspotRow } from "./lib/candidates.ts";
export { CANDIDATE_SORTS, compareCandidates, isLogicFile, rankCandidates } from "./lib/candidates.ts";
export type { MutationPlan } from "./lib/named-files.ts";
export { planMutationRun } from "./lib/named-files.ts";
export type { StatusCounts } from "./lib/summary.ts";
export { countStatuses, exitForCounts, testedCount } from "./lib/summary.ts";
export { aggregateExit, checkTargets, parseTargetArgs, selectTargets } from "./lib/target-plan.ts";
export { findTargetTests, readTestCorpus } from "./lib/target-tests.ts";
export type { MutationTarget } from "./lib/targets.ts";
export { worldOf } from "./lib/world.ts";
export { runMutation } from "./ops/run.ts";
export { runMutationTargets } from "./ops/targets.ts";
