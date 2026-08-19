// useAppearanceRootEffects — writes the appearance axes that must live on the document root (<html>),
// not the shell grid, so they reach everything including portaled content (modals/tooltips/popovers
// render to document.body, outside .shell-grid): font scale, theme, blur/shadow/texture attrs, reduced
// motion, and the reading-typography vars globals.css consumes. A layout effect with a clean teardown so a
// hot-swap never leaves a stale root attr.
//
// REDUCED MOTION MOVED HERE FROM .shell-grid (issue #188 P2-4). The `[data-reduced-motion="true"] *` floor
// in @orb/ui's globals.css is a DESCENDANT selector, so stamping the flag on the grid silently exempted
// everything the grid does not contain: the boot veil and the route-pending brand shimmer (both mounted
// above the router in main.tsx), every portalled surface, and the toaster. Measured on home: with the app's
// own reduced-motion setting ON, the loader still ran its keyframe and dropped 67-83ms frames — only the OS
// media query ever silenced it, which makes the in-app toggle a lie on the first screen a user sees. This is
// the same class the rest of this hook exists for, so it belongs in the same one home; the JS readers
// (`usePrefersReducedMotion`, `view-transition.ts`) query the attribute document-wide and are unaffected by
// which element carries it.

import type { BlurSurface, SurfaceTexture } from "@orb/contracts/settings";
import { useLayoutEffect } from "react";
import { DATA_THEME_ATTR, FONT_SCALE_VAR, REDUCED_MOTION_ATTR } from "#state";

const BLUR_SURFACE_ATTR: Record<BlurSurface, string> = {
  panels: "data-blur-panels",
  composer: "data-blur-composer",
  messages: "data-blur-messages",
  modals: "data-blur-modals",
};
const ALL_BLUR_ATTRS = Object.values(BLUR_SURFACE_ATTR);

/** The reading-typography numeric/boolean root vars, grouped so the hook's own param list stays legible. */
export interface ReadingTypographyVars {
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly paragraphSpacing: number;
  readonly nameScale: number;
  readonly bodyScale: number;
  readonly justify: boolean;
}

export function useAppearanceRootEffects(params: {
  readonly fontScale: number;
  readonly dataTheme: string | null;
  readonly blurSurfaces: readonly BlurSurface[];
  readonly shadowEffects: boolean;
  readonly blurStrength: number;
  readonly reading: ReadingTypographyVars;
  readonly themeColorization: boolean;
  readonly surfaceTexture: SurfaceTexture;
  readonly reducedMotion: boolean;
}): void {
  const { fontScale, dataTheme, blurSurfaces, shadowEffects, blurStrength, reading, themeColorization, surfaceTexture, reducedMotion } = params;
  useLayoutEffect((): (() => void) => {
    const root = document.documentElement;
    root.style.setProperty(FONT_SCALE_VAR, String(fontScale));
    root.style.setProperty("--blur-strength", `${blurStrength}px`);
    root.style.setProperty("--reading-line-height", String(reading.lineHeight));
    root.style.setProperty("--reading-letter-spacing", `${reading.letterSpacing}em`);
    root.style.setProperty("--reading-paragraph-spacing", `${reading.paragraphSpacing}rem`);
    root.style.setProperty("--reading-name-scale", String(reading.nameScale));
    root.style.setProperty("--reading-body-scale", String(reading.bodyScale));
    if (dataTheme === null) {
      root.removeAttribute(DATA_THEME_ATTR);
    } else {
      root.setAttribute(DATA_THEME_ATTR, dataTheme);
    }
    for (const attr of ALL_BLUR_ATTRS) {
      root.removeAttribute(attr);
    }
    for (const surface of blurSurfaces) {
      root.setAttribute(BLUR_SURFACE_ATTR[surface], "");
    }
    if (shadowEffects) {
      root.setAttribute("data-shadow", "");
    } else {
      root.removeAttribute("data-shadow");
    }
    if (reading.justify) {
      root.setAttribute("data-justify-body-text", "");
    } else {
      root.removeAttribute("data-justify-body-text");
    }
    if (themeColorization) {
      root.setAttribute("data-theme-colorization", "");
    } else {
      root.removeAttribute("data-theme-colorization");
    }
    if (surfaceTexture === "none") {
      root.removeAttribute("data-texture");
    } else {
      root.setAttribute("data-texture", surfaceTexture);
    }
    // Written as the literal "true"/"false" the CSS floor selects on (`[data-reduced-motion="true"]`) rather
    // than as presence: the OFF arm must still be a value, because the shell rendered it as one and a bare
    // presence attribute would match `[data-reduced-motion]` selectors that mean something else.
    //
    // THIS IS THE SECOND WRITER, NOT THE FIRST (#188 N-1, widened to font scale + theme by #231):
    // `main.tsx` replays this device's remembered answers onto <html> before React mounts, because the
    // shell cannot stamp until it has mounted and cannot be right until `getUserSettings` (and the chained
    // `getTheme`) resolves — and the boot veil animates, and the first shell layout happens, a beat before
    // either. The handoff is safe in ONE direction only, which is why `useAppearance` and `useSelectedTheme`
    // seed the SAME hints into their pending arms: an unresolved read that fell back to the schema default
    // would land here as `false` / `1` / no theme and un-stamp the replay — re-flowing every rem-derived
    // shell dimension and swapping the palette on the first screen of the visit. Every DOM name this hook
    // writes that the replay also writes is IMPORTED, not re-spelled, so the two writers cannot drift.
    root.setAttribute(REDUCED_MOTION_ATTR, String(reducedMotion));
    return (): void => {
      root.style.removeProperty(FONT_SCALE_VAR);
      root.style.removeProperty("--blur-strength");
      root.style.removeProperty("--reading-line-height");
      root.style.removeProperty("--reading-letter-spacing");
      root.style.removeProperty("--reading-paragraph-spacing");
      root.style.removeProperty("--reading-name-scale");
      root.style.removeProperty("--reading-body-scale");
      root.removeAttribute(DATA_THEME_ATTR);
      for (const attr of ALL_BLUR_ATTRS) {
        root.removeAttribute(attr);
      }
      root.removeAttribute("data-shadow");
      root.removeAttribute("data-justify-body-text");
      root.removeAttribute("data-theme-colorization");
      root.removeAttribute("data-texture");
      root.removeAttribute(REDUCED_MOTION_ATTR);
    };
  }, [fontScale, dataTheme, blurSurfaces, shadowEffects, blurStrength, reading, themeColorization, surfaceTexture, reducedMotion]);
}
