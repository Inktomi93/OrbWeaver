/**
 * `@orb/ui/lib` — the one class-merge home. `cn` is tailwind-variants' merge (tv subsumes
 * cva/clsx/tailwind-merge — D54); primitives and features import THIS, never a raw merge lib.
 *
 * Usage: `cn("flex", isActive && "bg-accent", className)`
 */
export { cn } from "tailwind-variants";
