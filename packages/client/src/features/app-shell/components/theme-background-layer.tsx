// The D63 (amends D49 §3) app-background root layer — the OPTIONAL decorative photo (now an `appearance`
// setting, palette-independent), rendered as a DEDICATED fixed-position element UNDER the shell (never
// `background-attachment: fixed`, which is iOS-broken with `cover` and janky on mobile — the researched
// best-practice this component exists to honor). `cover`/`contain` + center, plus a MANDATORY scrim
// (`dim`) between the image and the content — non-negotiable: a tunable overlay guarantees text
// legibility on ANY image, composing with the derived-contrast foregrounds + the Reading-Surface glass.
// Mounted ONCE at the app root (app-shell.tsx), which resolves the URL (from the appearance flat fields)
// and hands it in — this component only paints.
//
// Phase 4b §B.5.1 — `blur` (px) is a SEPARATE axis from `dim`: `filter: blur()` on the PHOTO div only,
// never `backdrop-filter` (which would also blur the scrim + every layer painted above it). The scrim
// div carries no filter, so text legibility never degrades even at a high blur value.

import type { AppearanceBackgroundFit } from "@orb/contracts/settings";
import type { CSSProperties, ReactElement } from "react";

export interface ThemeBackgroundLayerProps {
  /** The resolved image URL, or `null` for no image (kind `none` / unresolvable source). */
  readonly url: string | null;
  readonly fit: AppearanceBackgroundFit;
  readonly dim: number;
  /** Photo-only blur radius (px); 0 = crisp (byte-identical to pre-4b). */
  readonly blur: number;
}

/** Renders nothing when `url === null` — the app's normal `--color-background` paints through. */
export function ThemeBackgroundLayer({
  url,
  fit,
  dim,
  blur,
}: ThemeBackgroundLayerProps): ReactElement | null {
  if (url === null) {
    return null;
  }
  const photoStyle: CSSProperties = {
    backgroundImage: `url("${url}")`,
    backgroundSize: fit,
    // `blur(0px)` is a harmless no-op filter (kept unconditional so the style object shape never
    // toggles a `filter` key on/off across renders — a stable style-object contract).
    filter: `blur(${blur}px)`,
  };
  return (
    <>
      <div
        aria-hidden="true"
        data-slot="theme-background-layer"
        className="pointer-events-none fixed inset-0 z-(--z-base) bg-center bg-no-repeat"
        style={photoStyle}
      />
      {/* The mandatory scrim (non-negotiable) — the theme-aware `--color-scrim` token (D43 §11.4 —
          never a literal bg-black; scrim is baked at 0.6 alpha so it stays visible on a true-black
          theme too), further modulated by the user's OPACITY (dim) so it composes with any image +
          any palette. Deliberately carries NO filter — blur lands on the photo only. */}
      <div
        aria-hidden="true"
        data-slot="theme-background-scrim"
        className="pointer-events-none fixed inset-0 z-(--z-base) bg-scrim"
        style={{ opacity: dim }}
      />
    </>
  );
}
