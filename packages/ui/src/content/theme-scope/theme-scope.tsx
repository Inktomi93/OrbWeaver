import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { ThemeScopeTokens } from "./clamp";
import { clampThemeTokens } from "./clamp";

export interface ThemeScopeProps {
  /** Raw override tokens (untrusted for a per-character theme). Every value is clamped at the boundary. */
  readonly tokens: ThemeScopeTokens;
  readonly children: ReactNode;
  readonly className?: string;
}

// The ONLY sanctioned path for a ThemeOverride to reach the DOM — values are parsed + clamped by
// clampThemeTokens, so a hostile `accent: "url(//x)"` is dropped, not applied.
export function ThemeScope({ tokens, children, className }: ThemeScopeProps): ReactElement {
  const clamped = clampThemeTokens(tokens);
  // Only validated `--*` keys reach `style` — never raw caller style. `colorScheme` (derived from the
  // base surface's polarity, when known) rides `style` too so a custom LIGHT theme flips native
  // controls AND the light-dark() intent arms to their light values instead of the seed's dark scheme.
  const style: CSSProperties =
    clamped.colorScheme === undefined ? (clamped.vars as CSSProperties) : { ...(clamped.vars as CSSProperties), colorScheme: clamped.colorScheme };
  return (
    <div
      className={className}
      style={style}
      data-slot="theme-scope"
      {...(clamped.chatStyle === undefined ? {} : { "data-chat-style": clamped.chatStyle })}
      {...(clamped.density === undefined ? {} : { "data-density": clamped.density })}
    >
      {children}
    </div>
  );
}
