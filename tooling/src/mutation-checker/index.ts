// mutation-checker's front door. Stryker's `plugins` config imports this module, so `strykerPlugins` must stay exported.
export type { MutantEdit, MutantVerdict } from "./lib/mutant-world.ts";
export { MutantWorld } from "./lib/mutant-world.ts";
export { NATIVE_CHECKER_NAME, strykerPlugins } from "./lib/plugin.ts";
