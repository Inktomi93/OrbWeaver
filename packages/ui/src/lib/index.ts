/**
 * Cross-cutting `@orb/ui` seams with no better single home: the class-merge (`cn`), the configured
 * variant factory (`tv`), and the reduced-motion live-query hook. Primitives import these from here,
 * never a raw lib directly.
 *
 * @remarks
 * `cn` is tailwind-variants' merge (tv subsumes cva/clsx/tailwind-merge — D54).
 *
 * `tv` is a `createTV`-CONFIGURED factory, NOT the raw `tailwind-variants` export — and every
 * primitive MUST import it from here. The DTCG type-scale utilities (`text-display…text-micro`) are
 * custom `--text-*` tokens tailwind-merge doesn't know, so by default it classifies them as text
 * COLORS: `text-micro` next to a `text-muted-foreground` tone reads as a color conflict and the size
 * is silently dropped at runtime (every micro label shipped at the inherited 16px — verified in
 * browser). Registering the sizes as a `font-size` group fixes it, but ONLY when baked into the
 * factory via `createTV`: the per-call `tv(opts, { twMergeConfig })` form lost a cache race to a
 * config-less merge that classified `text-micro` first. One factory here = no config-less window,
 * and no per-primitive `twMergeConfig` to forget.
 */

import { createTV } from "tailwind-variants";

// isSafeColor moved DOWN to @orb/kit/safe-color (the contracts wire clamp shares it — see that
// file's header); re-exported so ui consumers keep their `#lib` import.
export { isSafeColor } from "@orb/kit/safe-color";
export { cn } from "tailwind-variants";
export { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

export const tv = createTV({
  twMergeConfig: {
    extend: {
      classGroups: {
        "font-size": [{ text: ["display", "headline", "title", "body", "label", "code", "micro"] }],
      },
    },
  },
});
