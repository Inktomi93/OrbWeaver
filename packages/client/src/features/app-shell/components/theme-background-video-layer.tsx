// The app-background VIDEO layer (BG-V) — the sibling of `<ThemeBackgroundLayer>` for a `video/*`
// background asset. A THIN COMPOSITE over the `@orb/ui` `<BackgroundVideo>` primitive: this layer owns the
// app-chrome concerns (fixed positioning, z-index, the mandatory legibility scrim, the fit→object-fit
// mapping); the primitive owns the media POLICY (muted/loop/autoplay/playsinline invariants, document.hidden
// pause, prefers-reduced-motion still-frame, decorative aria-hidden). Composing over the primitive is also
// what keeps this feature file gate-legal — the raw `<video>` element lives in the vetted ui primitive, not
// here (D44 `no-external-media-without-gate`).
//
// `object-fit` maps from the SAME `AppearanceBackgroundFit` union the image layer's `background-size`
// encodes (BG-B fit parity), passed to the primitive via `className` — it overrides the primitive's baked
// `object-cover` default (tailwind-merge dedupes). `appReducedMotion` (the app's own reduce-motion setting)
// forces the still frame on top of the OS `prefers-reduced-motion` the primitive already honors.

import type { AppearanceBackgroundFit } from "@orb/contracts/settings";
import { BackgroundVideo } from "@orb/ui/background-video";
import type { ReactElement } from "react";

export interface ThemeBackgroundVideoLayerProps {
  /** The resolved video blob URL, or `null` for no video (nothing renders). */
  readonly url: string | null;
  readonly fit: AppearanceBackgroundFit;
  readonly dim: number;
  /** The app's own reduce-motion setting — forces the still frame (OS `prefers-reduced-motion` also does). */
  readonly appReducedMotion: boolean;
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
export function ThemeBackgroundVideoLayer({ url, fit, dim, appReducedMotion }: ThemeBackgroundVideoLayerProps): ReactElement | null {
  if (url === null) {
    return null;
  }
  return (
    <>
      <div aria-hidden="true" data-slot="theme-background-video-layer" className="pointer-events-none fixed inset-0 z-(--z-base)">
        <BackgroundVideo src={url} paused={appReducedMotion} className={OBJECT_FIT_CLASS_BY_FIT[fit]} />
      </div>
      <div aria-hidden="true" data-slot="theme-background-scrim" className="pointer-events-none fixed inset-0 z-(--z-base) bg-scrim" style={{ opacity: dim }} />
    </>
  );
}
