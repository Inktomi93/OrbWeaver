// mutation-arid's front door. Stryker's `plugins` config points HERE (a relative path it resolves via
// pathToFileURL + import()), so `strykerPlugins` must stay exported from this module.
export type { AridCensus, AridNode, AridPath, AridReason } from "./contract/types.ts";
export { ARID_IGNORER_NAME, shouldIgnoreArid, strykerPlugins } from "./lib/predicate.ts";
export { aridCensus } from "./ops/census.ts";
