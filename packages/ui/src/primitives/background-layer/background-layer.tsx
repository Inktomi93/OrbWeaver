// A fixed, decorative, pointer-transparent layer under the shell: the wallpaper photo, a media carrier, or the
// legibility scrim over them. The photo and scrim values are runtime settings, so the primitive owns the inline
// style a feature may not write.

import type { CSSProperties, ReactElement, ReactNode } from "react";
import { BACKDROP_FILL, cn } from "#lib";

/** How the photo fills the viewport: the CSS keywords, both axes ignoring aspect, or natural size centred. */
const BACKGROUND_FITS = ["cover", "contain", "stretch", "center"] as const;
export type BackgroundFit = (typeof BACKGROUND_FITS)[number];

const BACKGROUND_SIZE_BY_FIT: Record<BackgroundFit, string> = {
  cover: "cover",
  contain: "contain",
  stretch: "100% 100%",
  center: "auto",
};

export interface BackgroundLayerProps {
  /** The `data-slot` the layer carries, so a rule or test can address it. */
  readonly slot: string;
  /** A photo painted as the layer's background; `blur` is the photo's own radius in px, never a backdrop filter. */
  readonly image?: { readonly url: string; readonly fit: BackgroundFit; readonly blur: number };
  /** The scrim arm: the polarity-fixed backdrop at this opacity. */
  readonly scrim?: { readonly dim: number };
  readonly children?: ReactNode;
}

function layerStyle({ image, scrim }: BackgroundLayerProps): CSSProperties | undefined {
  if (image !== undefined) {
    // `blur(0px)` is a no-op kept unconditional so the style object never toggles a key across renders.
    return { backgroundImage: `url("${image.url}")`, backgroundSize: BACKGROUND_SIZE_BY_FIT[image.fit], filter: `blur(${image.blur}px)` };
  }
  return scrim === undefined ? undefined : { opacity: scrim.dim };
}

export function BackgroundLayer(props: BackgroundLayerProps): ReactElement {
  const { slot, image, scrim, children } = props;
  return (
    <div
      aria-hidden="true"
      data-slot={slot}
      className={cn(
        "pointer-events-none fixed inset-0 z-(--z-base)",
        image === undefined ? undefined : "bg-center bg-no-repeat",
        scrim === undefined ? undefined : BACKDROP_FILL,
      )}
      style={layerStyle(props)}
    >
      {children}
    </div>
  );
}
