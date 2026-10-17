import type { TierImplementationHomes } from "../contract/tier-home.ts";

/** Shared native scope and missing-home health ownership; each tier keeps its own reasons. */
export const Z_INDEX_IMPLEMENTATION_HOMES = {
  "packages/ui/src/layout/": {
    why: "Layout primitives implement the shared stacking vocabulary; ends when that implementation moves.",
  },
  "packages/ui/src/markdown/": {
    why: "The markdown renderer maps prose surfaces onto the shared stacking vocabulary; ends when that implementation moves.",
  },
} as const satisfies TierImplementationHomes;
