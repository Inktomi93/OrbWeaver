/**
 * Cross-cutting `@orb/ui` seams with no better single home: class-merge (`cn`) and the
 * reduced-motion live-query hook. Primitives and features import these from here, never re-derive
 * or import a raw lib directly.
 *
 * @remarks
 * `cn` is tailwind-variants' merge (tv subsumes cva/clsx/tailwind-merge — D54).
 */

// isSafeColor moved DOWN to @orb/kit/safe-color (the contracts wire clamp shares it — see that
// file's header); re-exported so ui consumers keep their `#lib` import.
export { isSafeColor } from "@orb/kit/safe-color";
export { cn } from "tailwind-variants";
export { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
