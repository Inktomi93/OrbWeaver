// mutation-run's front door: the run the cli fronts, and the pure checks its tests pin.
export type { MutationPlan } from "./lib/named-files.ts";
export { planMutationRun } from "./lib/named-files.ts";
export type { StatusCounts } from "./lib/summary.ts";
export { countStatuses, exitForCounts, testedCount } from "./lib/summary.ts";
export { worldOf } from "./lib/world.ts";
export { runMutation } from "./ops/run.ts";
