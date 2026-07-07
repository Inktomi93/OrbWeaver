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
// A layout effect (pre-paint) with a clean teardown so a hot-swap never leaves a stale root attr.

import type { BlurSurface } from "@orb/contracts/settings";
import { useLayoutEffect } from "react";

const BLUR_SURFACE_ATTR: Record<BlurSurface, string> = {
  panels: "data-blur-panels",
  composer: "data-blur-composer",
  messages: "data-blur-messages",
  modals: "data-blur-modals",
};
const ALL_BLUR_ATTRS = Object.values(BLUR_SURFACE_ATTR);

export function useAppearanceRootEffects(params: {
  readonly fontScale: number;
  readonly dataTheme: string | null;
  readonly blurSurfaces: readonly BlurSurface[];
  readonly shadowEffects: boolean;
}): void {
  const { fontScale, dataTheme, blurSurfaces, shadowEffects } = params;
  useLayoutEffect((): (() => void) => {
    const root = document.documentElement;
    root.style.setProperty("--font-scale", String(fontScale));
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
    return (): void => {
      root.style.removeProperty("--font-scale");
      root.removeAttribute("data-theme");
      for (const attr of ALL_BLUR_ATTRS) {
        root.removeAttribute(attr);
      }
      root.removeAttribute("data-shadow");
    };
  }, [fontScale, dataTheme, blurSurfaces, shadowEffects]);
}
