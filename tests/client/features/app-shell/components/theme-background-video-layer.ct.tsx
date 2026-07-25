// CT: `ThemeBackgroundVideoLayer` (BG-V) — the app-chrome composite over the `@orb/ui` BackgroundVideo
// primitive. Pins the behavior the composite owns, at COMPUTED style (done-not-equal-rendered):
//   • a video source MOUNTS the primitive (the `background-video` slot), with the scrim above it.
//   • `fit` maps onto the primitive's computed `object-fit` (the BG-B fit parity with the image layer's
//     `background-size` — the same union, the video vocabulary).
//   • `appReducedMotion` forces the primitive's STILL arm (`data-motion`), independent of the OS setting.
//   • `url={null}` renders nothing (both slots absent).

import { expect, test } from "@playwright/experimental-ct-react";
import { ThemeBackgroundVideoLayer } from "../../../../../packages/client/src/features/app-shell/components/theme-background-video-layer";

const LAYER = '[data-slot="theme-background-video-layer"]';
const VIDEO = '[data-slot="background-video"]';
const SCRIM = '[data-slot="theme-background-scrim"]';
const SRC = "/api/blob/deadbeefcafe";

test("a video source mounts the ui BackgroundVideo primitive under the scrim", async ({ mount, page }) => {
  await mount(<ThemeBackgroundVideoLayer appReducedMotion={false} dim={0.4} fit="cover" url={SRC} />);

  await expect(page.locator(`${LAYER} ${VIDEO}`)).toHaveAttribute("src", SRC);
  await expect(page.locator(SCRIM)).toHaveCSS("opacity", "0.4");
});

test("fit=contain maps onto object-fit: contain", async ({ mount, page }) => {
  await mount(<ThemeBackgroundVideoLayer appReducedMotion={false} dim={0} fit="contain" url={SRC} />);
  await expect(page.locator(VIDEO)).toHaveCSS("object-fit", "contain");
});

test("fit=stretch fills both axes (object-fit: fill)", async ({ mount, page }) => {
  await mount(<ThemeBackgroundVideoLayer appReducedMotion={false} dim={0} fit="stretch" url={SRC} />);
  await expect(page.locator(VIDEO)).toHaveCSS("object-fit", "fill");
});

test("fit=center paints natural size (object-fit: none)", async ({ mount, page }) => {
  await mount(<ThemeBackgroundVideoLayer appReducedMotion={false} dim={0} fit="center" url={SRC} />);
  await expect(page.locator(VIDEO)).toHaveCSS("object-fit", "none");
});

test("appReducedMotion forces the primitive's still frame", async ({ mount, page }) => {
  await mount(<ThemeBackgroundVideoLayer appReducedMotion={true} dim={0} fit="cover" url={SRC} />);
  await expect(page.locator(VIDEO)).toHaveAttribute("data-motion", "still");
});

test("url=null renders nothing (no video layer, no scrim)", async ({ mount, page }) => {
  await mount(<ThemeBackgroundVideoLayer appReducedMotion={false} dim={0.4} fit="cover" url={null} />);
  await expect(page.locator(LAYER)).toHaveCount(0);
  await expect(page.locator(SCRIM)).toHaveCount(0);
});
