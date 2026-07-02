// CT: the crossfade-image seal — a two-layer CSS opacity crossfade on `src` change, collapsing to
// an instant swap under prefers-reduced-motion (ui-package-design §6, work-order item 16).

import { CrossfadeImage } from "@orb/ui/crossfade-image";
import { expect, test } from "@playwright/experimental-ct-react";

const ONE_PX_SVG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'><rect width='1' height='1' fill='red'/></svg>";
const OTHER_PX_SVG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'><rect width='1' height='1' fill='blue'/></svg>";

test("reserves the aspect box via aspectRatio even when src is null", async ({ mount, page }) => {
  await mount(<CrossfadeImage alt="Portrait" aspectRatio="16 / 9" src={null} />);

  const root = page.locator('[data-slot="crossfade-image"]');
  await expect(root).toHaveCSS("aspect-ratio", "16 / 9");
  await expect(page.locator('[data-slot="crossfade-image-current"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="crossfade-image-previous"]')).toHaveCount(0);

  const box = await root.boundingBox();
  // width must be nonzero (the caller sizes width via className/container; the ratio is what we own).
  expect(box?.width).toBeGreaterThan(0);
  expect(Math.round((box?.width ?? 0) / (16 / 9))).toBe(Math.round(box?.height ?? 0));
});

test("alt is applied to the rendered image", async ({ mount, page }) => {
  await mount(<CrossfadeImage alt="the owner's avatar" aspectRatio="1" src={ONE_PX_SVG} />);
  await expect(page.locator('[data-slot="crossfade-image-current"]')).toHaveAttribute(
    "alt",
    "the owner's avatar",
  );
});

test("on src change the new image fades in over the old, which is then dropped", async ({
  mount,
  page,
}) => {
  const component = await mount(<CrossfadeImage alt="Portrait" aspectRatio="1" src={ONE_PX_SVG} />);

  const current = page.locator('[data-slot="crossfade-image-current"]');
  const previous = page.locator('[data-slot="crossfade-image-previous"]');
  await expect(current).toHaveAttribute("src", ONE_PX_SVG);

  await component.update(<CrossfadeImage alt="Portrait" aspectRatio="1" src={OTHER_PX_SVG} />);

  // The new image is a real transition (nonzero duration) — contrasts with the reduced-motion case.
  const transitionDuration = await current.evaluate(
    (el) => getComputedStyle(el).transitionDuration,
  );
  expect(transitionDuration).not.toBe("0s");

  // The outgoing image is kept around as the static background layer while the new one fades in...
  await expect(previous).toHaveAttribute("src", ONE_PX_SVG);
  // ...then the new layer settles at full opacity...
  await expect(current).toHaveAttribute("src", OTHER_PX_SVG);
  await expect(current).toHaveCSS("opacity", "1");
  // ...and the old layer is dropped once the fade-in transition completes.
  await expect(previous).toHaveCount(0);
});

test("under prefers-reduced-motion the swap is instant (no transition)", async ({
  mount,
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });

  const component = await mount(<CrossfadeImage alt="Portrait" aspectRatio="1" src={ONE_PX_SVG} />);
  await component.update(<CrossfadeImage alt="Portrait" aspectRatio="1" src={OTHER_PX_SVG} />);

  const current = page.locator('[data-slot="crossfade-image-current"]');
  // The globals.css reduced-motion floor (D43 §11.4e) collapses every transition-duration to
  // 0.01ms !important (Chromium reports computed durations in seconds: 1e-05s), regardless of the
  // component's own duration-(--motion-base)/durationMs.
  await expect(current).toHaveCSS("transition-duration", "1e-05s");
  await expect(page.locator('[data-slot="crossfade-image-previous"]')).toHaveCount(0);
});
