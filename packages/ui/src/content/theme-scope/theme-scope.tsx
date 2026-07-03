import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { ThemeScopeTokens } from "./clamp";
import { clampThemeTokens } from "./clamp";

export interface ThemeScopeProps {
  /** Raw override tokens (untrusted for a per-character theme). Every value is clamped at the boundary. */
  readonly tokens: ThemeScopeTokens;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * `<ThemeScope>` — applies a validated token-override subset as SCOPED CSS custom properties on a
 * wrapping element (D44 §12.1). This is the ONLY sanctioned path for a `ThemeOverride` to reach the
 * DOM (gate `theme-override-only-via-scope`) — values are parsed + clamped by `clampThemeTokens`, so
 * a hostile `accent: "url(//x)"` / `"expression(1)"` is DROPPED, not applied. chatStyle/density ride
 * `data-*` attributes the shell + message render read; everything else is a `--color-*`/`--font-*`/
 * `--radius-*` custom property inherited by the subtree.
 *
 * Spec: UI-Theming §12.1 (D44) — the safe Tier-A theming boundary.
 */
export function ThemeScope({ tokens, children, className }: ThemeScopeProps): ReactElement {
  const clamped = clampThemeTokens(tokens);
  // Only validated `--*` keys reach `style` — never raw caller style (the gate forbids spreading a
  // ThemeOverride as `style`). The cast is to CSSProperties' custom-property index signature.
  const style = clamped.vars as CSSProperties;
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
