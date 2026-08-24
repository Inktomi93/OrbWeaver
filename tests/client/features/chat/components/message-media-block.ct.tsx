// CT: the #67 ASSET arm of `MessageMediaBlock`. A resolved `asset:<id>` (the row's `AttachmentUrlProvider`
// supplied a `blobUrl`) renders the real gated `<MessageMedia>` image at that url; an UNRESOLVED asset
// (provider-less mount / still loading — an empty context map) degrades to the `[image]` placeholder rather
// than a broken `<img>`. Proves the render arm the #67 seam swapped in (done ≠ rendered — the pixels, not
// just the source).

import { expect, test } from "@playwright/experimental-ct-react";
import { AttachmentMediaStory } from "../_ct-stories.tsx";

const MEDIA_IMG = '[data-slot="message-media"]';
const PNG_DATA_SRC = /^data:image\/png/u;

test("a resolved asset ref renders the real image at its blob url (no placeholder)", async ({ mount }) => {
  // The story provides its own resolved (data-URL) blob src for the asset via the context.
  const component = await mount(<AttachmentMediaStory />);
  const img = component.locator(MEDIA_IMG);
  await expect(img).toHaveCount(1);
  await expect(img).toHaveAttribute("src", PNG_DATA_SRC);
  await expect(img).toHaveAttribute("alt", "an attached image");
  await expect(component.getByText("[image]")).toHaveCount(0);
});

// #622 — the in-thread arm of the never-distort law. No producer of a chat media block fills `dims` (the
// stored body is `![alt](asset:<id>)` and the projection is dimension-blind), so the primitive's no-dims
// reservation is what every room image renders under: it must yield to the image's OWN ratio once known.
const PORTRAIT_RATIO = 1024 / 1536;
const RATIO_PRECISION = 2;
const VIEWPORTS = [
  { label: "desktop", width: 1280, height: 900 },
  { label: "mobile", width: 390, height: 844 },
] as const;

for (const vp of VIEWPORTS) {
  test(`#622 (${vp.label}): a 1024×1536 room image paints at its own 2:3 ratio, never a forced 16:9`, async ({ mount, page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const component = await mount(<AttachmentMediaStory portrait={true} />);
    const img = component.locator(MEDIA_IMG);
    // Barrier on the SETTLED (decoded) image — an <img> with no intrinsic size yet lays out at 0×0.
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth / (el as HTMLImageElement).naturalHeight))
      .toBeCloseTo(PORTRAIT_RATIO, RATIO_PRECISION);
    const box = await img.boundingBox();
    expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(PORTRAIT_RATIO, RATIO_PRECISION);
    expect(box?.width ?? 0).toBeLessThanOrEqual(vp.width);
  });
}

test("an unresolved asset ref degrades to the [image] placeholder, never a broken img", async ({ mount }) => {
  // Empty context map (the provider-less / still-loading state).
  const component = await mount(<AttachmentMediaStory empty={true} />);
  await expect(component.getByText("[image]")).toBeVisible();
  await expect(component.locator(MEDIA_IMG)).toHaveCount(0);
});

test("#317: an asset resolved with a video mime renders the native <video> arm, not an <img>", async ({ mount, page }) => {
  // The block projection is mime-blind (`media:"image"` on the block); the ASSET arm re-picks the element
  // off the resolved mime — this pins that a video attachment never renders a broken <img>. Page-scoped
  // locator: the <video> IS the mounted component's root node (the image arm nests under a zoom button,
  // the video arm does not), so a component-scoped search would look INSIDE it and find nothing.
  await mount(<AttachmentMediaStory video={true} />);
  const media = page.locator(MEDIA_IMG);
  await expect(media).toHaveCount(1);
  const tag = await media.evaluate((el) => el.tagName);
  expect(tag).toBe("VIDEO");
});
