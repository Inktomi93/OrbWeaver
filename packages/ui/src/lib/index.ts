/**
 * The one class-merge home in `@orb/ui`. Primitives and features import `cn`
 * from here, never a raw merge lib.
 *
 * @remarks
 * `cn` is tailwind-variants' merge (tv subsumes cva/clsx/tailwind-merge — D54).
 */

// isSafeColor moved DOWN to @orb/kit/safe-color (the contracts wire clamp shares it — see that
// file's header); re-exported so ui consumers keep their `#lib` import.
export { isSafeColor } from "@orb/kit/safe-color";
export { cn } from "tailwind-variants";
