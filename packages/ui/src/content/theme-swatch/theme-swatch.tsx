// theme-swatch — the theme STRIPE a menu row leads with (#866 S4, owner addendum #3). It renders from the
// theme's REAL stored override values through `<ThemeScope>` (the D71 clamp derives base · card · accent
// from the picked background — the same derivation the theme paints with, so the stripe can never be a
// hand-painted approximation). §13.9 litmus: domain-agnostic (takes tokens + strings), one committed
// consumer (the character tab's StartFromThemeField menu).
//
// ONE shape: `ThemeSwatchStrip`, the decorative three-cell chip a MENU row leads with. The `ThemeSwatchCard`
// that used to sit beside it (strip over a name row, `aria-pressed`) retired with #920 — the Looks
// collection renders every theme as the app's ONE picker cell with a `ThemeMiniSurface` thumbnail, and a
// second card anatomy for the same job is precisely the split that ruling removed. The three-cell chip
// survives because a MENU row's leading slot is a genuinely different job from a picker cell, and it is
// the only mount left (§13.9's inclusion litmus: ≥1 committed consumer).

import type { ReactElement } from "react";
import { cn, variantAttrs } from "#lib";
import type { ThemeScopeTokens } from "../theme-scope/clamp.ts";
import { ThemeScope } from "../theme-scope/theme-scope.tsx";
import { themeSwatchVariants } from "./variants.ts";

export interface ThemeSwatchStripProps {
  /** The theme's REAL stored override values — clamped and derived by `<ThemeScope>`, never re-spelled. */
  readonly tokens: ThemeScopeTokens;
  readonly size?: "row" | "card";
  readonly className?: string;
}

/** The three-cell stripe: base surface · card surface · accent, painted by the theme's own derivation.
 *  Decorative (`aria-hidden`) — the NAME beside it carries the identity. */
export function ThemeSwatchStrip({ tokens, size = "row", className }: ThemeSwatchStripProps): ReactElement {
  const slots = themeSwatchVariants({ size });
  return (
    // `aria-hidden` rides a wrapper — ThemeScope's own root takes no ARIA props by design (its API is the
    // clamp boundary, nothing else).
    // STAMP SITE (#1097): the strip WRAPPER. `size` sizes the strip (and its cells), and this span is the
    // slot the audit identifies the swatch by — `ThemeScope`, which wears the sized classes, takes only
    // `tokens`/`className` by design (its API is the clamp boundary), so it is not a stampable element.
    <span aria-hidden={true} data-slot="theme-swatch-strip" {...variantAttrs(themeSwatchVariants, { size })}>
      <ThemeScope className={cn(slots.strip(), className) ?? ""} tokens={tokens}>
        <span className={cn(slots.cell(), "bg-background") ?? ""} />
        <span className={cn(slots.cell(), "bg-card") ?? ""} />
        <span className={cn(slots.cell(), "bg-primary") ?? ""} />
      </ThemeScope>
    </span>
  );
}
