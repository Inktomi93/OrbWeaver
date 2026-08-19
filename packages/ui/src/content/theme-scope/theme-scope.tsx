import type { CSSProperties, ReactElement, ReactNode } from "react";
import { createContext, use } from "react";
import type { ThemeScopeTokens } from "./clamp.ts";
import { clampThemeTokens } from "./clamp.ts";

export interface ThemeScopeProps {
  /** Raw override tokens (untrusted for a per-character theme). Every value is clamped at the boundary. */
  readonly tokens: ThemeScopeTokens;
  readonly children: ReactNode;
  readonly className?: string;
  /**
   * The base surface this scope's output is painted on when `tokens` carries no `background` of its own
   * — the ROOT of the ambient chain (#236). Only the app shell sets it, from the ACTIVE APP THEME's base
   * (a seed's generated `--color-background`, a custom theme's picked one); every nested scope inherits
   * through the context below instead. It is a judging input for the §7a ink clamp, never emitted.
   */
  readonly ambientBackground?: string;
}

/**
 * The base surface a DESCENDANT scope will be painted on — this scope's own picked background when it
 * has one, else whatever it was itself handed (#236). `null` = nothing statically named the surface, so
 * the §7a ink clamp keeps its fail-open. A provider-less mount (a CT story, a preview) therefore behaves
 * exactly as it did pre-#236: an ink-only override passes through unjudged.
 *
 * The value handed down is the CLAMPED background — `vars["--color-background"]`, i.e. the value that
 * survived `isSafeColor`, never the raw prop — so a hostile override cannot re-enter the clamp through
 * the ambient door of the scopes nested inside it.
 */
const AmbientBaseContext = createContext<string | null>(null);

// The ONLY sanctioned path for a ThemeOverride to reach the DOM — values are parsed + clamped by
// clampThemeTokens, so a hostile `accent: "url(//x)"` is dropped, not applied.
export function ThemeScope({ tokens, children, className, ambientBackground }: ThemeScopeProps): ReactElement {
  const inheritedBase = use(AmbientBaseContext);
  const ambient = ambientBackground ?? inheritedBase;
  const clamped = clampThemeTokens(tokens, ambient ?? undefined);
  // Only validated `--*` keys reach `style` — never raw caller style. `colorScheme` (derived from the
  // base surface's polarity, when known) rides `style` too so a custom LIGHT theme flips native
  // controls AND the light-dark() intent arms to their light values instead of the seed's dark scheme.
  const style: CSSProperties =
    clamped.colorScheme === undefined ? (clamped.vars as CSSProperties) : { ...(clamped.vars as CSSProperties), colorScheme: clamped.colorScheme };
  return (
    <AmbientBaseContext value={clamped.vars["--color-background"] ?? ambient}>
      <div className={className} style={style} data-slot="theme-scope" {...(clamped.density === undefined ? {} : { "data-density": clamped.density })}>
        {children}
      </div>
    </AmbientBaseContext>
  );
}
