// The app-background VIDEO layer (BG-V) — the sibling of `<ThemeBackgroundLayer>` for a `video/*`
// background asset. A THIN COMPOSITE over the `@orb/ui` `<BackgroundVideo>` primitive: this layer owns the
// app-chrome concerns (fixed positioning, z-index, the mandatory legibility scrim, the fit→object-fit
// mapping); the primitive owns the media POLICY (muted/loop/autoplay/playsinline invariants, document.hidden
// pause, the reduced-motion still frame from the resolved app and OS preference, decorative aria-hidden). Composing over the primitive is also
// what keeps this feature file gate-legal — the raw `<video>` element lives in the vetted ui primitive, not
// here (D44, Biome `noRestrictedElements`).
//
// `object-fit` maps from the SAME `AppearanceBackgroundFit` union the image layer's `background-size`
// encodes (BG-B fit parity), passed to the primitive via `className` — it overrides the primitive's baked
// `object-cover` default (tailwind-merge dedupes).

import type { AppearanceBackgroundFit } from "@orb/contracts/settings";
import { BackgroundLayer } from "@orb/ui/background-layer";
import { BackgroundVideo } from "@orb/ui/background-video";
import type { ReactElement } from "react";

export interface ThemeBackgroundVideoLayerProps {
  /** The resolved video blob URL, or `null` for no video (nothing renders). */
  readonly url: string | null;
  readonly fit: AppearanceBackgroundFit;
  readonly dim: number;
}

// The `object-fit` utility each fit maps to: `cover`/`contain` verbatim; `stretch` fills both axes
// (`object-fill`); `center` paints at natural size (`object-none`, centered by the default object-position).
const OBJECT_FIT_CLASS_BY_FIT: Record<AppearanceBackgroundFit, string> = {
  cover: "object-cover",
  contain: "object-contain",
  stretch: "object-fill",
  center: "object-none",
};

/** Renders nothing when `url === null` — the app's normal `--color-background` paints through. */
export function ThemeBackgroundVideoLayer({ url, fit, dim }: ThemeBackgroundVideoLayerProps): ReactElement | null {
  if (url === null) {
    return null;
  }
  return (
    <>
      <BackgroundLayer slot="theme-background-video-layer">
        <BackgroundVideo src={url} className={OBJECT_FIT_CLASS_BY_FIT[fit]} />
      </BackgroundLayer>
      <BackgroundLayer slot="theme-background-scrim" scrim={{ dim }} />
    </>
  );
}
