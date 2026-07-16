// CT: the skeleton seal — a muted shimmer the caller sizes; the circle variant is square
// (ui-package-design §6.1). The shimmer is reduced-motion-safe (drops to a flat muted fill).

import { Skeleton } from "@orb/ui/skeleton";
import { expect, test } from "@playwright/experimental-ct-react";

// --spacing-avatar-md is 2rem → 32px at the 16px root. A pointer-INDEPENDENT token, so the
// caller-height assertion is stable regardless of the CT's pointer (control-* narrows on fine).
const AVATAR_MD_PX = 32;
const SHIMMER_CLASS = /orb-skeleton-shimmer/u;
const MUTED_CLASS = /bg-muted/u;

test("shimmers on the muted token and takes the caller-supplied height", async ({ mount }) => {
  const skeleton = await mount(<Skeleton className="h-avatar-md w-full" />);
  await expect(skeleton).toHaveClass(SHIMMER_CLASS);
  await expect(skeleton).toHaveClass(MUTED_CLASS);
  const box = await skeleton.boundingBox();
  expect(Math.round(box?.height ?? 0)).toBe(AVATAR_MD_PX);
});

test("the shimmer sweep is a moving gradient over --motion-shimmer (animated by default)", async ({ mount }) => {
  const skeleton = await mount(<Skeleton className="h-control-md w-full" />);
  // The gradient sweep is a background-image (not just a color) with a running animation.
  const image = await skeleton.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(image).toContain("linear-gradient");
  const name = await skeleton.evaluate((el) => getComputedStyle(el).animationName);
  expect(name).toBe("orb-skeleton-shimmer");
});

test("reduced-motion drops to a FLAT muted fill (no gradient, no animation)", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const skeleton = await mount(<Skeleton className="h-control-md w-full" />);
  // The class self-neutralizes under reduced motion: no gradient image, animation off — bg-muted shows.
  await expect(skeleton).toHaveCSS("background-image", "none");
  const name = await skeleton.evaluate((el) => getComputedStyle(el).animationName);
  expect(name).toBe("none");
});

test("the circle variant renders a square (aspect-square)", async ({ mount }) => {
  const skeleton = await mount(<Skeleton className="w-control-md" variant="circle" />);
  const box = await skeleton.boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(Math.round(box?.height ?? 0));
});
