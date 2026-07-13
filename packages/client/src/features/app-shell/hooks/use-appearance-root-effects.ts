// useAppearanceRootEffects — writes the appearance axes that must live on the document root (<html>),
// not the shell grid, so they reach everything including portaled content (modals/tooltips/popovers
// render to document.body, outside .shell-grid): font scale, theme, blur/shadow/texture attrs, and the
// reading-typography vars globals.css consumes. A layout effect with a clean teardown so a hot-swap never
// leaves a stale root attr.

import type { BlurSurface, SurfaceTexture } from "@orb/contracts/settings";
import { useLayoutEffect } from "react";

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
}): void {
  const {
    fontScale,
    dataTheme,
    blurSurfaces,
    shadowEffects,
    blurStrength,
    reading,
    themeColorization,
    surfaceTexture,
  } = params;
  useLayoutEffect((): (() => void) => {
    const root = document.documentElement;
    root.style.setProperty("--font-scale", String(fontScale));
    root.style.setProperty("--blur-strength", `${blurStrength}px`);
    root.style.setProperty("--reading-line-height", String(reading.lineHeight));
    root.style.setProperty("--reading-letter-spacing", `${reading.letterSpacing}em`);
    root.style.setProperty("--reading-paragraph-spacing", `${reading.paragraphSpacing}rem`);
    root.style.setProperty("--reading-name-scale", String(reading.nameScale));
    root.style.setProperty("--reading-body-scale", String(reading.bodyScale));
    if (dataTheme === null) {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", dataTheme);
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
    return (): void => {
      root.style.removeProperty("--font-scale");
      root.style.removeProperty("--blur-strength");
      root.style.removeProperty("--reading-line-height");
      root.style.removeProperty("--reading-letter-spacing");
      root.style.removeProperty("--reading-paragraph-spacing");
      root.style.removeProperty("--reading-name-scale");
      root.style.removeProperty("--reading-body-scale");
      root.removeAttribute("data-theme");
      for (const attr of ALL_BLUR_ATTRS) {
        root.removeAttribute(attr);
      }
      root.removeAttribute("data-shadow");
      root.removeAttribute("data-justify-body-text");
      root.removeAttribute("data-theme-colorization");
      root.removeAttribute("data-texture");
    };
  }, [
    fontScale,
    dataTheme,
    blurSurfaces,
    shadowEffects,
    blurStrength,
    reading,
    themeColorization,
    surfaceTexture,
  ]);
}
