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

test("the shimmer sweep translates a compositor layer over --motion-shimmer", async ({ mount }) => {
  const skeleton = await mount(<Skeleton className="h-control-md w-full" />);
  const styles = await skeleton.evaluate((el) => {
    const root = getComputedStyle(el);
    const sweep = getComputedStyle(el, "::after");
    return { rootAnimation: root.animationName, image: sweep.backgroundImage, name: sweep.animationName };
  });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(styles.image).toContain("linear-gradient");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(styles.name).toBe("orb-skeleton-shimmer");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(styles.rootAnimation).toBe("none");
});

test("reduced-motion drops to a FLAT muted fill (no gradient, no animation)", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const skeleton = await mount(<Skeleton className="h-control-md w-full" />);
  const styles = await skeleton.evaluate((el) => {
    const sweep = getComputedStyle(el, "::after");
    return { display: sweep.display, rootAnimation: getComputedStyle(el).animationName };
  });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(styles.display).toBe("none");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(styles.rootAnimation).toBe("none");
});

test("the app-level reduced-motion preference also removes the shimmer layer", async ({ mount, page }) => {
  await page.locator("html").evaluate((element) => element.setAttribute("data-reduced-motion", "true"));
  const skeleton = await mount(<Skeleton className="h-control-md w-full" />);
  await expect.poll(async () => await skeleton.evaluate((el) => getComputedStyle(el, "::after").display)).toBe("none");
});

test("the circle variant renders a square (aspect-square)", async ({ mount }) => {
  const skeleton = await mount(<Skeleton className="w-control-md" variant="circle" />);
  const box = await skeleton.boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(Math.round(box?.height ?? 0));
});
