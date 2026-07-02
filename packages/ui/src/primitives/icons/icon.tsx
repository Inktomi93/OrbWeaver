// The gate-clean sizing approach (chosen and documented per ui-package-design §6.1): lucide
// components take a `size` NUMBER prop, so icon sizes are named px consts pinned to the type-scale
// tokens below — no raw `size-4` classes (gate-RED), no `size-[1em]` arbitrary values, no extra
// icon-size token. The token linkage IS this table.
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
  /** A lucide component from `@orb/ui/icons` — the ONE icon set (gate icons-lucide-only). */
  icon: LucideIcon;
  size?: keyof typeof ICON_SIZES;
  /** Accessible name. Omitted = decorative (`aria-hidden`), the default for icons beside text. */
  label?: string;
  className?: string;
}

/**
 * Sizing wrapper for the curated lucide set — icons scale with the type scale via the ICON_*
 * consts, decorative by default (ui-package-design §6.1 icons seal).
 *
 * Usage: `<Icon icon={Trash2} size="sm" label="Delete" />`.
 */
export function Icon({ icon: Glyph, size = "md", label, className }: IconProps): ReactElement {
  return (
    <Glyph
      size={ICON_SIZES[size]}
      aria-hidden={label === undefined}
      aria-label={label}
      className={className}
    />
  );
}
