// CustomThemeStyle — injects the OWNER's active theme custom CSS (`themes.css`, D44 §12.1 Tier-B /
// global-owner tier) into the live document. This is Layer 1 of the theming model and is strictly
// OWN-CLIENT: it renders only the viewing user's OWN selected theme's CSS — a participant's raw CSS is
// NEVER pushed to other viewers (§12.0: untrusted raw CSS never enters another user's main DOM; only the
// structured per-character override crosses users, safely, via <ThemeScope>).
//
// MECHANICS (load-bearing for overridability — do NOT "simplify"): the CSS is appended as an UNLAYERED
// <style> to the END of <head>, AFTER every app stylesheet. Unlayered beats @layer utilities (unlayered
// always wins over layered, regardless of specificity), and last-in-<head> beats the unlayered shell.css
// by source order — so "redefine any --token or restyle any selector and it wins" is actually true. We
// use raw DOM (not a JSX <style>) so React never hoists/dedupes/re-orders it, and we do NOT wrap the CSS
// in an app-root scope: a scope wrapper (`#app-root {…}` nesting or `@scope`) would silently break a
// `:root{--token:…}` redefine (the root is the wrapper's ANCESTOR, unmatchable) — and this is the owner's
// OWN trusted CSS (self-inflicted risk), so raw global injection is correct. It still passes
// `validateThemeCss` first (the shell-break guard: `position:fixed/sticky` on chrome is rejected).

import { validateThemeCss } from "@orb/kit/css-validate";
import { useLayoutEffect } from "react";

const STYLE_MARKER = "data-orb-theme-css";

export interface CustomThemeStyleProps {
  /** The active theme's custom CSS, or `null`/empty for none. */
  readonly css: string | null;
}

export function CustomThemeStyle({ css }: CustomThemeStyleProps): null {
  useLayoutEffect((): (() => void) | undefined => {
    const trimmed = css?.trim() ?? "";
    if (trimmed === "") {
      return;
    }
    // Never inject CSS that fails the containment guard (a rejected rule could break the app chrome).
    if (validateThemeCss(trimmed).errors.length > 0) {
      return;
    }
    const el = document.createElement("style");
    el.setAttribute(STYLE_MARKER, "");
    el.textContent = trimmed;
    // Appended LAST → unlayered + last-in-<head> ⇒ wins over @layer utilities and shell.css.
    document.head.appendChild(el);
    return (): void => {
      el.remove();
    };
  }, [css]);
  return null;
}
