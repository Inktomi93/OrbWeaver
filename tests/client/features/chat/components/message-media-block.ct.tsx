// CT: the #67 ASSET arm of `MessageMediaBlock`. A resolved `asset:<id>` (the row's `AttachmentUrlProvider`
// supplied a `blobUrl`) renders the real gated `<MessageMedia>` image at that url; an UNRESOLVED asset
// (provider-less mount / still loading — an empty context map) degrades to the `[image]` placeholder rather
// than a broken `<img>`. Proves the render arm the #67 seam swapped in (done ≠ rendered — the pixels, not
// just the source).

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { holdPortraitImage, layoutBox, PORTRAIT_RATIO, PORTRAIT_W } from "../../../../support/browser/held-portrait-image.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { seedActiveChat } from "../../../../support/node/seed-active-chat.ts";
import { AttachmentMediaStory, RoomImageDetailStory } from "../_ct-stories.tsx";

const MEDIA_IMG = '[data-slot="message-media"]';
const PNG_DATA_SRC = /^data:image\/png/u;

// ── #618: the click→imageDetail path with a NON-NULL active chat ──────────────────────────────────────
// The other tests in this file mount with NO active chat, so they exercise the plain-zoom fallback. This
// one seeds one. It matters because `openImageDetail`'s `chatId` is PINNED AT OPEN TIME from
// `useActiveChatId` — that pin is what makes "set as background" structurally unable to target a room the
// viewer navigated to AFTER opening the shell-level modal. The lane that built it proved that property
// STRUCTURALLY (the block's lone consumer is message-content.tsx); this proves it BEHAVIOURALLY, through
// the only thing a user can see: the background write carries the seeded room's id.

/** MINTED, never a hand-written literal — see `seedActiveChat`'s own note on why a readable fake id
 *  silently heals the store to `landing` and takes this test's arm out from under it. */
const ACTIVE_CHAT = mintTypeId(ID_PREFIX.chat);

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

test("#618: clicking a room image with an ACTIVE chat opens the detail modal BOUND to that chat", async ({ mount, page }) => {
  await seedActiveChat(page, ACTIVE_CHAT);
  const trpc = await routeTrpc(page, {
    // The provenance strip's read — absent is a legal render (the strip says so), it just must not throw.
    "imagery.readProvenance": () => null,
    "assets.resolveBlobRefs": () => [{ assetId: "asset_ct_attach", hash: "deadbeef", mime: "image/png" }],
    "chat.setChatBackground": () => ({}),
  });

  const component = await mount(<RoomImageDetailStory />);
  // The IMAGE arm, not the plain-zoom fallback: with a room active the block wires `onActivate` to
  // `openImageDetail`, so the media is an activatable control rather than a zoom trigger.
  const img = component.locator(MEDIA_IMG);
  await expect(img).toHaveCount(1);
  await img.click();

  // Barrier on the SETTLED detail body — a modal that opened, not a frame mid-flight.
  const setBackground = page.getByRole("button", { name: "Set as background" });
  await expect(setBackground).toBeVisible();

  // The BINDING, through the only thing a user can cause: the background write names the seeded room.
  await setBackground.click();
  await expect.poll(() => trpc.count("chat.setChatBackground")).toBe(1);
  await expect
    .poll(() => trpc.lastInput("chat.setChatBackground"))
    .toMatchObject({ chatId: ACTIVE_CHAT, background: { kind: "asset", assetId: "asset_ct_attach" } });
});

// #625 — the RESERVATION arm: the row's resolved asset now carries the STORED dims, so the box is the
// image's true box while the bytes are still in flight (before #625 the <img> sat at 0×0 and the thread
// reflowed the moment it decoded). The url is held permanently pending so this measures the pre-decode box.
const PENDING_SRC = "/blob/ct-625-pending-portrait.png";
const MIN_RESERVED_PX = 1;

test("#625: a resolved asset's stored dims reserve its TRUE box before the bytes arrive", async ({ mount, page }) => {
  await page.route(`**${PENDING_SRC}`, () => undefined);
  await page.setViewportSize({ width: VIEWPORTS[1].width, height: VIEWPORTS[1].height });
  const component = await mount(<AttachmentMediaStory reservedSrc={PENDING_SRC} />);
  const img = component.locator(MEDIA_IMG);
  // Visible at all is the assertion that bites: a dims-less <img> with nothing decoded lays out 0×0.
  await expect(img).toBeVisible();
  const box = await img.boundingBox();
  expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(PORTRAIT_RATIO, RATIO_PRECISION);
  expect(box?.height ?? 0).toBeGreaterThan(MIN_RESERVED_PX);
});

// #654 — the ZOOM LIGHTBOX arm. #625 reserved the inline image and stopped there: clicking the very same
// picture to enlarge it re-mounted a dims-less `MessageMedia` inside the modal, so it popped in from 0×0 at
// the size where a reflow is most visible. The dims are two lines away in `MediaWithZoom` — this drives the
// real user chain (inline image → zoom) rather than the primitive, so it fails if EITHER the block stops
// forwarding or the Lightbox stops accepting.
const PENDING_ZOOM_SRC = "/blob/ct-654-pending-zoom-portrait.png";

for (const vp of VIEWPORTS) {
  test(`#654 (${vp.label}): the ZOOM lightbox reserves the image's true box before the bytes arrive`, async ({ mount, page }) => {
    const release = await holdPortraitImage(page, PENDING_ZOOM_SRC);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    // No active chat ⇒ the plain-zoom arm (the imagery detail modal is the other door, pinned below).
    await mount(<AttachmentMediaStory reservedSrc={PENDING_ZOOM_SRC} />);
    // Page-scoped: the zoom BUTTON *is* the mounted component's root node, so a component-scoped search
    // would look inside it and find nothing (the same trap the #317 test below documents).
    await page.locator('[data-slot="message-media-zoom"]').click();

    // Barrier on the SETTLED modal — the Dialog portals to the body, so this is page-scoped.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const zoomed = dialog.locator(MEDIA_IMG);
    // Visible at all is the assertion that bites: a dims-less <img> with nothing decoded lays out 0×0.
    await expect(zoomed).toBeVisible();
    const reserved = await layoutBox(zoomed);
    expect(reserved.w / reserved.h).toBeCloseTo(PORTRAIT_RATIO, RATIO_PRECISION);
    expect(reserved.h).toBeGreaterThan(MIN_RESERVED_PX);

    // The claim in full: the reserved box IS the true box. Release the bytes, barrier on the DECODED
    // image, and the geometry must not have moved — that identity is what "no reflow" means.
    await release();
    await expect.poll(() => zoomed.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(PORTRAIT_W);
    expect(await layoutBox(zoomed)).toEqual(reserved);
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
  await expect(media).toHaveJSProperty("tagName", "VIDEO");
});
