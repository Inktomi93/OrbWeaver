// The app-background root layer — the optional decorative photo, rendered as a dedicated fixed-position
// element under the shell (never background-attachment: fixed, which is iOS-broken with cover). Plus a
// mandatory scrim between the image and content, non-negotiable for text legibility. Mounted once at the
// app root, which resolves the URL and hands it in — this component only paints.
//
// `blur` is a separate axis from `dim`: filter: blur() on the photo div only, never backdrop-filter
// (which would also blur the scrim + every layer above it).

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

// The CSS `background-size` each fit resolves to: `cover`/`contain` are the CSS keywords verbatim;
// `stretch` fills both axes ignoring aspect (`100% 100%`); `center` paints the image at its natural size
// (`auto`), centered by the `bg-center` class below (ST's fit vocabulary — BG-B).
const BACKGROUND_SIZE_BY_FIT: Record<AppearanceBackgroundFit, string> = {
  cover: "cover",
  contain: "contain",
  stretch: "100% 100%",
  center: "auto",
};

/** Renders nothing when `url === null` — the app's normal `--color-background` paints through. */
export function ThemeBackgroundLayer({ url, fit, dim, blur }: ThemeBackgroundLayerProps): ReactElement | null {
  if (url === null) {
    return null;
  }
  const photoStyle: CSSProperties = {
    backgroundImage: `url("${url}")`,
    backgroundSize: BACKGROUND_SIZE_BY_FIT[fit],
    // blur(0px) is a harmless no-op, kept unconditional so the style object shape never toggles a filter key across renders.
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
      <div aria-hidden="true" data-slot="theme-background-scrim" className="pointer-events-none fixed inset-0 z-(--z-base) bg-scrim" style={{ opacity: dim }} />
    </>
  );
}
