import type { TierImplementationHomes } from "../contract/tier-home.ts";

/** Native lint scope for the z-index rules. `tests/tooling/z-index-implementation-homes.test.ts` checks each home still holds a source file. */
export const Z_INDEX_IMPLEMENTATION_HOMES = {
  "packages/ui/src/layout/": {
    why: "Layout primitives implement the shared stacking vocabulary; ends when that implementation moves.",
  },
  "packages/ui/src/markdown/": {
    why: "The markdown renderer maps prose surfaces onto the shared stacking vocabulary; ends when that implementation moves.",
  },
} as const satisfies TierImplementationHomes;
