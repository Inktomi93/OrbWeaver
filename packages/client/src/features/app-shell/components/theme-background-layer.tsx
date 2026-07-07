// The D49 §3 background-image root layer (WS3) — the theme's optional decorative photo, rendered as a
// DEDICATED fixed-position element UNDER the shell (never `background-attachment: fixed`, which is
// iOS-broken with `cover` and janky on mobile — the researched best-practice this component exists to
// honor). `cover`/`contain` + center, plus a MANDATORY scrim (`backgroundDim`) between the image and
// the content — non-negotiable per D49 §3: a tunable overlay guarantees text legibility on ANY image,
// designed for the worst case, composing with the derived-contrast foregrounds + the Reading-Surface
// glass. Mounted ONCE at the app root (app-shell.tsx), NOT inside `<ThemeScope>` — a nested per-speaker
// ThemeScope must never spawn a second background layer.
//
// URL resolution is `../lib/resolve-theme-background.ts` (split out — `useComponentExportOnlyModules`
// forbids a non-component export from this file; that module also documents the FLAG[PD-131] asset gap).

import type { ClampedTheme } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import { resolveThemeBackgroundUrl } from "../lib/resolve-theme-background";

export interface ThemeBackgroundLayerProps {
  readonly backgroundImage: ClampedTheme["backgroundImage"];
  readonly backgroundFit: ClampedTheme["backgroundFit"];
  readonly backgroundDim: ClampedTheme["backgroundDim"];
}

const DEFAULT_FIT = "cover";
const DEFAULT_DIM = 0.45; // D49 §3 "default ~40-50%"

/** Renders nothing when no image is set (or an asset-kind image awaiting PD-131/#67) — the app's
 *  normal `--color-background` paints through, unchanged from today. */
export function ThemeBackgroundLayer({
  backgroundImage,
  backgroundFit,
  backgroundDim,
}: ThemeBackgroundLayerProps): ReactElement | null {
  const url = resolveThemeBackgroundUrl(backgroundImage);
  if (url === null) {
    return null;
  }
  const fit = backgroundFit ?? DEFAULT_FIT;
  const dim = backgroundDim ?? DEFAULT_DIM;
  return (
    <>
      <div
        aria-hidden="true"
        data-slot="theme-background-layer"
        className="pointer-events-none fixed inset-0 z-(--z-base) bg-center bg-no-repeat"
        style={{ backgroundImage: `url("${url}")`, backgroundSize: fit }}
      />
      {/* The mandatory scrim (non-negotiable per D49 §3) — the theme-aware `--color-scrim` token (D43
          §11.4 — never a literal bg-black; scrim is baked at 0.6 alpha so it stays visible on a
          true-black theme too), further modulated by the user's OPACITY (backgroundDim) so it composes
          with any image + any palette. */}
      <div
        aria-hidden="true"
        data-slot="theme-background-scrim"
        className="pointer-events-none fixed inset-0 z-(--z-base) bg-scrim"
        style={{ opacity: dim }}
      />
    </>
  );
}
