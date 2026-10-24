// The app-background root layer: the optional wallpaper photo under the shell plus the mandatory legibility scrim
// between it and the content. Mounted once at the app root, which resolves the URL; this component only paints.

import type { AppearanceBackgroundFit } from "@orb/contracts/settings";
import { BackgroundLayer } from "@orb/ui/background-layer";
import type { ReactElement } from "react";

export interface ThemeBackgroundLayerProps {
  /** The resolved image URL, or `null` for no image (kind `none` / unresolvable source). */
  readonly url: string | null;
  readonly fit: AppearanceBackgroundFit;
  readonly dim: number;
  /** Photo-only blur radius (px); 0 = crisp. */
  readonly blur: number;
}

/** Renders nothing when `url === null`: the app's normal `--color-background` paints through. */
export function ThemeBackgroundLayer({ url, fit, dim, blur }: ThemeBackgroundLayerProps): ReactElement | null {
  if (url === null) {
    return null;
  }
  return (
    <>
      <BackgroundLayer slot="theme-background-layer" image={{ url, fit, blur }} />
      <BackgroundLayer slot="theme-background-scrim" scrim={{ dim }} />
    </>
  );
}
