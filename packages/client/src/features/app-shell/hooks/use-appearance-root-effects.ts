// `useAppearanceRootEffects` — writes the appearance axes that must live on the DOCUMENT ROOT (<html>),
// not the shell grid, so they reach everything including PORTALED content (modals, tooltips, popovers
// render to document.body, outside `.shell-grid`):
//   • `--font-scale` — the globals.css `:root { font-size: calc(100% * var(--font-scale)) }` floor reads
//     it, rescaling every rem app-wide.
//   • `data-theme` — a SEED palette's [data-theme=…] block (globals.css) redefines the --color-* set on
//     <html>, so the whole document (portals included) reflows + flips color-scheme. `null` (Hearth
//     default or a custom theme) removes the attribute → the :root Hearth palette shows through.
//   • `data-blur-panels`/`data-blur-composer`/`data-blur-messages`/`data-blur-modals` (WS3 D44 §12.1
//     appearance.blurSurfaces) — presence-based per-surface gates; MUST be root-level (not
//     `.shell-grid`) because Dialog/AlertDialog popups portal to `document.body`, outside the grid.
//     globals.css keys its glass recipe off these.
//   • `data-shadow` (WS3 appearance.shadowEffects) — same portal reasoning is moot for prose (never
//     portalled) but rides the same root for ONE stamping site.
//   • `--blur-strength` (Phase 4b §B.5.5 appearance.blurStrength) — overrides the tokens.json 14px
//     default; every existing glass rule already reads `var(--blur-strength)`, so this is the ONE dial.
//   • `--reading-line-height`/`--reading-letter-spacing`/`--reading-paragraph-spacing`/
//     `--reading-name-scale`/`--reading-body-scale` (Phase 4b §B.5.3 reading-typography) — root vars
//     consumed by globals.css on `[data-slot="message-bubble"]`/`[data-slot="message-attribution"]`.
//   • `data-justify-body-text` (Phase 4b §B.5.3 justifyBodyText) — presence-based, same shape as
//     `data-shadow`.
//   • `data-theme-colorization` (Phase 4b §B.5.5 enableThemeColorization) — presence-based; globals.css
//     retints the border/hairline chrome tokens from the accent color under this attr.
//   • `data-texture` (appearance.surfaceTexture) — `grain` stamps `[data-texture=grain]` (a film-grain
//     ::after overlay on shell chrome + cards, globals.css); `none` removes it. Value-based so a future
//     texture value slots in without a new attr. MUST be root-level so cards in portalled surfaces also
//     get it, same reasoning as the blur attrs.
// A layout effect (pre-paint) with a clean teardown so a hot-swap never leaves a stale root attr.

import type { BlurSurface, SurfaceTexture } from "@orb/contracts/settings";
import { useLayoutEffect } from "react";

const BLUR_SURFACE_ATTR: Record<BlurSurface, string> = {
  panels: "data-blur-panels",
  composer: "data-blur-composer",
  messages: "data-blur-messages",
  modals: "data-blur-modals",
};
const ALL_BLUR_ATTRS = Object.values(BLUR_SURFACE_ATTR);

/** The reading-typography numeric/boolean root vars (Phase 4b §B.5.3) — grouped so the hook's own param
 *  list stays legible (mirrors the flat-param shape the pre-4b axes already use). */
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
