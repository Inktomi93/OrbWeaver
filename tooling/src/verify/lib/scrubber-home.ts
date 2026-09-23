// The hidden-span stream scrubber's declaration home — the one subject the `scrubber-home` family's two halves
// must agree on. `scrubber-home` resolves every reference against this home and `scrubber-factory-home` proves
// the home still exports the factory; if the two named different directories the completeness half would stop
// covering the reference half without either one failing. Keyed as the DIRECTORY so an internal split of the
// content module cannot silently retire the reference arm.
import type { SealedHome } from "./sealed-origin.ts";

export const SCRUBBER_SYMBOL = "createHiddenSpanStreamScrubber";

export const SCRUBBER_HOME: SealedHome = { pathInfix: "/packages/kit/src/content/", exportedNames: new Set([SCRUBBER_SYMBOL]) };
