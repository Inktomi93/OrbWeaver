// mutation-arid's front door. Stryker's `plugins` config imports this module, so `strykerPlugins` must stay exported.
export type { AridCensus, AridNode, AridPath, AridReason, MutantStatus, ReportMutant } from "./contract/types.ts";
export { MUTANT_STATUSES } from "./contract/types.ts";
export { ARID_IGNORER_NAME, shouldIgnoreArid, strykerPlugins } from "./lib/predicate.ts";
export { aridCensus, readStrykerMutants } from "./ops/census.ts";
