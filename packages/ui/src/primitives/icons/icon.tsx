// Lucide components take a `size` NUMBER prop, so icon sizes are named px consts pinned to the
// type-scale tokens below instead of raw/arbitrary Tailwind classes. The token linkage IS this table.
import type { LucideIcon } from "lucide-react";
import type { ReactElement } from "react";

/** 12px — pairs with `--text-label`; sub-`sm` indicator marks (checkbox/select/number-field glyphs). */
export const ICON_XS = 12;
/** 16px — pairs with `--text-title` (1rem) body-adjacent chrome. */
export const ICON_SM = 16;
/** 20px — pairs with `--text-headline` (1.25rem); the default control icon. */
export const ICON_MD = 20;
/** 24px — pairs with `--text-display` (1.5rem) hero/empty-state glyphs. */
export const ICON_LG = 24;

const ICON_SIZES = { xs: ICON_XS, sm: ICON_SM, md: ICON_MD, lg: ICON_LG } as const;

/** The house line-weight (owner taste dial, tunable). Paired with lucide's `absoluteStrokeWidth` so the
 *  stroke stays a CONSTANT px width across every icon size — an `xs` glyph and an `lg` glyph read at the
 *  same weight, app-wide (without it, lucide scales the stroke with the box, so small icons look heavier).
 *  A caller can still override per-instance via `strokeWidth`. */
const HOUSE_STROKE_WIDTH = 1.75;

export interface IconProps {
  icon: LucideIcon;
  size?: keyof typeof ICON_SIZES;
  /** Per-instance stroke override (rarely needed — the house weight is the default). @defaultValue 1.75 */
  strokeWidth?: number;
  /** Accessible name. Omitted = decorative (`aria-hidden`), the default for icons beside text. */
  label?: string;
  className?: string;
}

/** Sizing wrapper for the curated lucide set — decorative by default; constant house stroke weight. */
export function Icon({ icon: Glyph, size = "md", strokeWidth = HOUSE_STROKE_WIDTH, label, className }: IconProps): ReactElement {
  return (
    <Glyph
      size={ICON_SIZES[size]}
      absoluteStrokeWidth={true}
      strokeWidth={strokeWidth}
      aria-hidden={label === undefined}
      aria-label={label}
      className={className}
    />
  );
}
