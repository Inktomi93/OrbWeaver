// The D63 (amends D49 §3) app-background root layer — the OPTIONAL decorative photo (now an `appearance`
// setting, palette-independent), rendered as a DEDICATED fixed-position element UNDER the shell (never
// `background-attachment: fixed`, which is iOS-broken with `cover` and janky on mobile — the researched
// best-practice this component exists to honor). `cover`/`contain` + center, plus a MANDATORY scrim
// (`dim`) between the image and the content — non-negotiable: a tunable overlay guarantees text
// legibility on ANY image, composing with the derived-contrast foregrounds + the Reading-Surface glass.
// Mounted ONCE at the app root (app-shell.tsx), which resolves the URL (from the appearance flat fields)
// and hands it in — this component only paints.

import type { AppearanceBackgroundFit } from "@orb/contracts/settings";
import type { ReactElement } from "react";

export interface ThemeBackgroundLayerProps {
  /** The resolved image URL, or `null` for no image (kind `none` / unresolvable source). */
  readonly url: string | null;
  readonly fit: AppearanceBackgroundFit;
  readonly dim: number;
}

/** Renders nothing when `url === null` — the app's normal `--color-background` paints through. */
export function ThemeBackgroundLayer({
  url,
  fit,
  dim,
}: ThemeBackgroundLayerProps): ReactElement | null {
  if (url === null) {
    return null;
  }
  return (
    <>
      <div
        aria-hidden="true"
        data-slot="theme-background-layer"
        className="pointer-events-none fixed inset-0 z-(--z-base) bg-center bg-no-repeat"
        style={{ backgroundImage: `url("${url}")`, backgroundSize: fit }}
      />
      {/* The mandatory scrim (non-negotiable) — the theme-aware `--color-scrim` token (D43 §11.4 —
          never a literal bg-black; scrim is baked at 0.6 alpha so it stays visible on a true-black
          theme too), further modulated by the user's OPACITY (dim) so it composes with any image +
          any palette. */}
      <div
        aria-hidden="true"
        data-slot="theme-background-scrim"
        className="pointer-events-none fixed inset-0 z-(--z-base) bg-scrim"
        style={{ opacity: dim }}
      />
    </>
  );
}
