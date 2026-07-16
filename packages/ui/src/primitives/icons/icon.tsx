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

export interface IconProps {
  icon: LucideIcon;
  size?: keyof typeof ICON_SIZES;
  /** Accessible name. Omitted = decorative (`aria-hidden`), the default for icons beside text. */
  label?: string;
  className?: string;
}

/** Sizing wrapper for the curated lucide set — decorative by default. */
export function Icon({ icon: Glyph, size = "md", label, className }: IconProps): ReactElement {
  return <Glyph size={ICON_SIZES[size]} aria-hidden={label === undefined} aria-label={label} className={className} />;
}
