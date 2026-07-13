// CustomThemeStyle — injects the owner's active theme custom CSS into the live document. Strictly
// own-client: it renders only the viewing user's own selected theme's CSS — a participant's raw CSS is
// never pushed to other viewers (only the structured per-character override crosses users, via <ThemeScope>).
//
// Do not "simplify" the mechanics: the CSS is appended as an unlayered <style> to the end of <head>,
// after every app stylesheet, so it wins over @layer utilities AND shell.css by source order. Raw DOM
// (not JSX <style>) so React never hoists/reorders it. No app-root scope wrapper — that would break a
// `:root{--token:…}` redefine (the root becomes the wrapper's unmatchable ancestor); this is the owner's
// own trusted CSS, so raw global injection is correct. Passes `validateThemeCss` first regardless.

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
    if (validateThemeCss(trimmed).errors.length > 0) {
      return;
    }
    const el = document.createElement("style");
    el.setAttribute(STYLE_MARKER, "");
    el.textContent = trimmed;
    document.head.appendChild(el);
    return (): void => {
      el.remove();
    };
  }, [css]);
  return null;
}
