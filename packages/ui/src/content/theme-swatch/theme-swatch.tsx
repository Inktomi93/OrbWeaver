// theme-swatch — ONE swatch anatomy for every theme-picker mount (#866 S4, owner addendum #3): the Looks
// section's shipped cards + Your-themes rows, the builder's start-from state, and the character tab's
// StartFromThemeField all render the SAME stripe from the theme's REAL stored override values, through
// `<ThemeScope>` (the D71 clamp derives base · card · accent from the picked background — the same
// derivation the theme paints with, so the stripe can never be a hand-painted approximation). §13.9
// litmus: domain-agnostic (takes tokens + strings), multiple committed consumers.
//
// Two shapes: `ThemeSwatchStrip` (the decorative three-cell chip — a ListRow's leading slot) and
// `ThemeSwatchCard` (strip over a name row; a toggle button whose selected state wears the ring —
// `aria-pressed`, the apply-not-mode picker cell).

import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import { Text } from "#primitives/text";
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
    <span aria-hidden={true} data-slot="theme-swatch-strip">
      <ThemeScope className={cn(slots.strip(), className) ?? ""} tokens={tokens}>
        <span className={cn(slots.cell(), "bg-background") ?? ""} />
        <span className={cn(slots.cell(), "bg-card") ?? ""} />
        <span className={cn(slots.cell(), "bg-primary") ?? ""} />
      </ThemeScope>
    </span>
  );
}

export interface ThemeSwatchCardProps {
  readonly tokens: ThemeScopeTokens;
  readonly name: string;
  /** A short trailing datum on the name row ("current", an age). */
  readonly meta?: ReactNode;
  readonly selected?: boolean;
  readonly onSelect?: () => void;
}

/** The picker CARD: the stripe over a name row. A toggle button — `aria-pressed` carries the applied
 *  state and the ring follows it (apply-not-mode: picking a card APPLIES the look, #297). */
export function ThemeSwatchCard({ tokens, name, meta, selected = false, onSelect }: ThemeSwatchCardProps): ReactElement {
  const slots = themeSwatchVariants({ size: "card" });
  return (
    // `aria-label` pins the accessible NAME to the theme's name alone — `aria-pressed` carries the
    // applied state and `meta` stays visual, so "Hearth" is one findable control, not "Hearth current".
    <button aria-label={name} aria-pressed={selected} className={slots.card()} data-slot="theme-swatch-card" onClick={onSelect} type="button">
      <ThemeSwatchStrip className={slots.cardStrip()} size="card" tokens={tokens} />
      <span className={slots.cardBody()}>
        <Text as="span" voice="label" className="truncate">
          {name}
        </Text>
        {meta === undefined ? null : (
          <Text as="span" voice="datum">
            {meta}
          </Text>
        )}
      </span>
    </button>
  );
}
