// The native declaration home used by the hidden-span factory reference boundary.
// A directory identity permits internal module splits without changing construction authority.

import type { SealedHome } from "./sealed-origin.ts";

export const SCRUBBER_SYMBOL = "createHiddenSpanStreamScrubber";

export const SCRUBBER_HOME: SealedHome = { pathInfix: "/packages/kit/src/content/", exportedNames: new Set([SCRUBBER_SYMBOL]) };
