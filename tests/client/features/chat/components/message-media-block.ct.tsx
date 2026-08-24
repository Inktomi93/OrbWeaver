// CT: the #67 ASSET arm of `MessageMediaBlock`. A resolved `asset:<id>` (the row's `AttachmentUrlProvider`
// supplied a `blobUrl`) renders the real gated `<MessageMedia>` image at that url; an UNRESOLVED asset
// (provider-less mount / still loading — an empty context map) degrades to the `[image]` placeholder rather
// than a broken `<img>`. Proves the render arm the #67 seam swapped in (done ≠ rendered — the pixels, not
// just the source).

import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
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

/** MINTED, never a hand-written literal: the store's rehydrate runs the persisted handle through
 *  `typeIdSchema(ID_PREFIX.chat)`, which demands a real 26-char base32 suffix — a readable fake id is
 *  DISCARDED and the store heals to `landing`, so the block silently takes the null-chat zoom arm and this
 *  test goes green-looking-red for the wrong reason. (Measured: `chat_ct_room_image_01` did exactly that.) */
const ACTIVE_CHAT = mintTypeId(ID_PREFIX.chat);
/** The persisted active-chat store's localStorage key. Unbound identity ⇒ the legacy (un-namespaced) key
 *  (`durable-local.ts`: `orb:` + the store name); a CT binds no user. */
const ACTIVE_CHAT_STORAGE_KEY = "orb:active-chat";

/** Seed the persisted store BEFORE any page script runs, THEN reload. Both halves are load-bearing and each
 *  was paid for: an effect (or a `selectChat` call) lands AFTER the media block's first commit, which is
 *  where `useActiveChatId` is read, so the block would already have taken the null-chat fallback — and
 *  `addInitScript` alone is not enough either, because the CT fixture has already navigated to the harness
 *  page by the time a test body runs, so the script would not fire until some later navigation. Measured:
 *  without the reload this test fails exactly like the neutered-source RED does. After the reload the store
 *  rehydrates at module init from SYNCHRONOUS localStorage, so there is no rehydrate race left to barrier
 *  on — the read happens before the store exists. */
async function seedActiveChat(page: Page, chatId: ChatId): Promise<void> {
  await page.addInitScript(
    ([key, id]: readonly [string, string]) => {
      globalThis.localStorage.setItem(key, JSON.stringify({ state: { handle: { kind: "committed", id } }, version: 1 }));
    },
    [ACTIVE_CHAT_STORAGE_KEY, chatId] as const,
  );
  await page.reload();
}

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
