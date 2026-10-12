// CT: the @orb/ui BackgroundVideo primitive (BG-V). Asserts the BAKED policy (muted/loop/playsinline
// invariants, no controls, decorative aria-hidden, captions track) and the motion arms via `data-motion`
// (the deterministic resolved-state signal — real playback is unreliable in CT): animates by default,
// STILLS under OS prefers-reduced-motion, STILLS under the `paused` prop, and STILLS + pauses when the tab
// goes hidden. CT (not headless) — every arm is a render + effect + media-query/visibility interaction.

import { BackgroundVideo } from "@orb/ui/background-video";
import { expect, test } from "@playwright/experimental-ct-react";

const SRC = "/api/blob/deadbeefcafe";

test("bakes the background-loop policy attributes", async ({ mount }) => {
  const video = await mount(<BackgroundVideo src={SRC} />);

  await expect(video).toHaveAttribute("data-slot", "background-video");
  await expect(video).toHaveAttribute("aria-hidden", "true");
  await expect(video).toHaveAttribute("tabindex", "-1");
  await expect(video).toHaveJSProperty("muted", true);
  await expect(video).toHaveJSProperty("loop", true);
  await expect(video).toHaveJSProperty("playsInline", true);
  await expect(video).toHaveJSProperty("controls", false);
  // A captions track satisfies the media-caption a11y contract without a suppression.
  await expect(video.locator("track")).toHaveAttribute("kind", "captions");
});

test("animates by default (autoplay + data-motion playing)", async ({ mount }) => {
  const video = await mount(<BackgroundVideo src={SRC} />);

  await expect(video).toHaveJSProperty("autoplay", true);
  await expect(video).toHaveAttribute("data-motion", "playing");
});

test("OS prefers-reduced-motion holds the still frame (no autoplay, data-motion still)", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const video = await mount(<BackgroundVideo src={SRC} />);

  await expect(video).toHaveJSProperty("autoplay", false);
  await expect(video).toHaveAttribute("data-motion", "still");
});

test("the paused prop holds the still frame regardless of OS motion", async ({ mount }) => {
  const video = await mount(<BackgroundVideo src={SRC} paused={true} />);

  await expect(video).toHaveJSProperty("autoplay", false);
  await expect(video).toHaveAttribute("data-motion", "still");
});

test("pauses and stills when the tab becomes hidden", async ({ mount, page }) => {
  const video = await mount(<BackgroundVideo src={SRC} />);
  await expect(video).toHaveAttribute("data-motion", "playing");

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect(video).toHaveAttribute("data-motion", "still");
});
