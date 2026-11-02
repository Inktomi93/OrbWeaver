import type { CSSProperties, ReactElement, ReactNode } from "react";
import { createContext, use, useEffect } from "react";
import { AmbientScopeContext } from "#lib";
import type { AmbientPalette, ThemeScopeTokens } from "./clamp.ts";
import { clampThemeTokens } from "./clamp.ts";
import { InputBorderFallbackReporterContext, ToneFallbackReporterContext } from "./tone-fallback.ts";

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
  /**
   * The accent this scope's graphics will be PAINTED WITH when `tokens` carries no `accent` of its own —
   * the ROOT of the ambient-accent chain (#692), the sibling of `ambientBackground`. Only the app shell
   * sets it, from the ACTIVE APP THEME's `--color-primary`; every nested scope inherits through the
   * context below. `--color-primary` is the one PICKED token a carried palette does not derive, so a room
   * that picks a light background inherits the app theme's accent through the cascade — Hearth's over a
   * near-white room's card measures 2.5858:1, under WCAG 1.4.11. It is a judging input: when it clears,
   * nothing is emitted and the cascade stands.
   */
  readonly ambientAccent?: string;
}

/**
 * The opaque base pixel a DESCENDANT scope will be painted on — this scope's picked background composited
 * over its ambient when needed, else whatever it was itself handed (#236). `null` = no known surface, so
 * the §7a ink clamp keeps its fail-open. A provider-less mount (a CT story, a preview) therefore behaves
 * exactly as it did pre-#236: an ink-only override passes through unjudged.
 *
 * The value handed down is `ClampedTheme.resolvedBackground`, never a raw prop — so alpha and invalid
 * safe words cannot lie about the pixel nested scopes actually land on. `palette` says whether a scope
 * that carried that background painted it (D336), which an accent-only descendant solves its primary on.
 */
const AmbientBaseContext = createContext<AmbientBase | null>(null);
AmbientBaseContext.displayName = "AmbientBaseContext";

interface AmbientBase {
  readonly pixel: string;
  readonly palette: AmbientPalette;
}

/**
 * The accent a DESCENDANT scope will paint with — this scope's own picked one when it has one, else
 * whatever it was itself handed (#692, the `AmbientBaseContext` shape exactly). The value handed down is
 * the VALIDATED one (`ClampedTheme.accentSource`), never the raw prop, so a hostile override cannot
 * re-enter the clamp through the ambient door of the scopes nested inside it — and it is the SOURCE
 * rather than the emitted fill, because a nested room judges the author's pick against its own derived
 * card (that field's contract states the algebra).
 */
const AmbientAccentContext = createContext<string | null>(null);
AmbientAccentContext.displayName = "AmbientAccentContext";

// The ONLY sanctioned path for a ThemeOverride to reach the DOM — values are parsed + clamped by
// clampThemeTokens, so a hostile `accent: "url(//x)"` is dropped, not applied.
export function ThemeScope({ tokens, children, className, ambientBackground, ambientAccent }: ThemeScopeProps): ReactElement {
  const inheritedBase = use(AmbientBaseContext);
  const inheritedAccent = use(AmbientAccentContext);
  // The shell hands the active app theme's base to the root scope, which carries that background itself when the theme is custom.
  const ambient: AmbientBase | null = ambientBackground === undefined ? inheritedBase : { pixel: ambientBackground, palette: "seed" };
  const accentAmbient = ambientAccent ?? inheritedAccent;
  const scopeAmbient = use(AmbientScopeContext);
  const clamped = clampThemeTokens(tokens, ambient?.pixel, accentAmbient ?? undefined, { palette: ambient?.palette, ...scopeAmbient });
  const reportFallback = use(ToneFallbackReporterContext);
  const reportInputBorderFallback = use(InputBorderFallbackReporterContext);
  // The fallback's fields, not the object the clamp rebuilds every render, so a scope reports one fallback once.
  const fallbackAccent = clamped.toneFallback?.accent;
  const fallbackHover = clamped.toneFallback?.hover;
  const fallbackActive = clamped.toneFallback?.active;
  useEffect(() => {
    if (reportFallback !== null && fallbackAccent !== undefined && fallbackHover !== undefined && fallbackActive !== undefined) {
      reportFallback({ accent: fallbackAccent, hover: fallbackHover, active: fallbackActive });
    }
  }, [reportFallback, fallbackAccent, fallbackHover, fallbackActive]);
  const fallbackEdge = clamped.inputBorderFallback?.edge;
  const fallbackFloorMet = clamped.inputBorderFallback?.floorMet;
  useEffect(() => {
    if (reportInputBorderFallback !== null && fallbackEdge !== undefined && fallbackFloorMet !== undefined) {
      reportInputBorderFallback({ edge: fallbackEdge, floorMet: fallbackFloorMet });
    }
  }, [reportInputBorderFallback, fallbackEdge, fallbackFloorMet]);
  // Only validated `--*` keys reach `style` — never raw caller style. `colorScheme` (derived from the
  // base surface's polarity, when known) rides `style` too so a custom LIGHT theme flips native
  // controls AND the light-dark() intent arms to their light values instead of the seed's dark scheme.
  //
  // `color` (#2424) rides it for the same reason one step further: a scope that paints its OWN surface
  // must also restate the ink descendants take by INHERITANCE, or they keep the ink resolved ABOVE the
  // scope (`.shell-grid`'s `color: var(--color-foreground)`) against a surface this scope painted — the
  // measured 1.13:1 typed composer under a Light app theme in a card-themed room. Neither is a custom
  // property, so neither may enter `vars`; both are emitted ONLY where the clamp decided they are owned
  // (`ClampedTheme.color` states the gate), so an ink-only scope stays byte-identical.
  const style: CSSProperties = {
    ...(clamped.vars as CSSProperties),
    ...(clamped.colorScheme === undefined ? {} : { colorScheme: clamped.colorScheme }),
    ...(clamped.color === undefined ? {} : { color: clamped.color }),
  };
  return (
    <AmbientBaseContext value={clamped.resolvedBackground === undefined ? ambient : { pixel: clamped.resolvedBackground, palette: "carried" }}>
      <AmbientAccentContext value={clamped.accentSource ?? accentAmbient}>
        <AmbientScopeContext
          value={{
            inks: clamped.proseInks,
            fills: clamped.bubbleFills,
            scopes: clamped.bubbleScopes,
            inside: scopeAmbient.inside,
          }}
        >
          <div className={className} style={style} data-slot="theme-scope" {...(clamped.density === undefined ? {} : { "data-density": clamped.density })}>
            {children}
          </div>
        </AmbientScopeContext>
      </AmbientAccentContext>
    </AmbientBaseContext>
  );
}
