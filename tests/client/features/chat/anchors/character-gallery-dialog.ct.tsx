// CT: the per-character gallery lightbox (features/chat/anchors/character-gallery-dialog.tsx) — the two
// side-eye fixes. (a) P0 geometry: the lightbox pins its title + action row and scrolls ONLY the image
// body, so "Remove from gallery" and "Close" stay ON-SCREEN at 1280×800 (and the tighter 1366×768) where
// the old fixed square pushed them past the fold of the non-scrolling popup. (b) P2 destructive-confirm:
// removal now goes through an AlertDialog — `assets.removeFromGallery` does NOT fire on the first click,
// only after the explicit confirm (the chat-delete rule). Network is stubbed via routeTrpc.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { dropFiles } from "../../../../support/browser/drop-files.ts";
import type { TrpcInput, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { CharacterGalleryDialogStory, CharacterGalleryDialogToastStory } from "../_ct-stories.tsx";

const ITEM = {
  galleryItemId: "galleryitem_ct_1",
  assetId: "asset_ct_1",
  hash: "a".repeat(64),
  mime: "image/png",
  animated: false,
  subjectCharacterId: "character_ct_gallery",
  createdAt: 1,
};

const OWNED = [
  { assetId: "asset_ct_owned_1", hash: "b".repeat(64), mime: "image/png", size: 1024, uploadedAt: 1, animated: false, kind: "gallery" },
  { assetId: "asset_ct_owned_2", hash: "c".repeat(64), mime: "image/png", size: 2048, uploadedAt: 2, animated: false, kind: "gallery" },
] satisfies TrpcWireOutput<"assets.listOwned">;

/** The one asset the partial-batch pin scripts a rejection for — named, so the stub reads no indexed
 *  element and the claim "the SECOND one failed" is legible where the assertion is. */
const FAILING_ASSET = "asset_ct_owned_2";

/** THE app's toast outlet — `CtToastSurface`'s production `AppToaster` renders one root per notice. */
const TOAST_ROOT = '[data-slot="toast-root"]';

async function openLightbox(page: Page): Promise<void> {
  const cell = page.getByRole("gridcell", { name: "Gallery image" });
  await expect(cell).toBeVisible();
  await cell.click();
  await expect(page.getByRole("button", { name: "Remove from gallery" })).toBeVisible();
}

/** The viewport-space bottom edge of a lightbox action button (throws if it has no layout box). */
async function buttonBottom(page: Page, name: string): Promise<number> {
  const box = await page.getByRole("button", { name }).boundingBox();
  if (box === null) {
    throw new Error(`gallery lightbox CT: "${name}" has no layout box`);
  }
  return box.y + box.height;
}

test("P0: the lightbox action buttons stay on-screen at 1280×800", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await routeTrpc(page, { "assets.listGallery": () => [ITEM] });

  await mount(<CharacterGalleryDialogStory />);
  await openLightbox(page);

  await expect.poll(() => buttonBottom(page, "Remove from gallery")).toBeLessThan(800);
  await expect.poll(() => buttonBottom(page, "Close")).toBeLessThan(800);
});

test("P0: the lightbox action buttons stay on-screen at the tighter 1366×768", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await routeTrpc(page, { "assets.listGallery": () => [ITEM] });

  await mount(<CharacterGalleryDialogStory />);
  await openLightbox(page);

  await expect.poll(() => buttonBottom(page, "Remove from gallery")).toBeLessThan(768);
  await expect.poll(() => buttonBottom(page, "Close")).toBeLessThan(768);
});

test("P2: removal goes through a confirm — the mutation fires only AFTER confirming", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const trpc = await routeTrpc(page, {
    "assets.listGallery": () => [ITEM],
    "assets.removeFromGallery": () => null,
  });

  await mount(<CharacterGalleryDialogStory />);
  await openLightbox(page);

  // First click opens the AlertDialog confirm — it does NOT remove anything yet.
  await page.getByRole("button", { name: "Remove from gallery" }).click();
  await expect(page.getByText("Remove this image?")).toBeVisible();
  await expect.poll(() => trpc.count("assets.removeFromGallery")).toBe(0);

  // Confirming fires the removal with the item's id.
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect.poll(() => trpc.count("assets.removeFromGallery"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => trpc.lastInput("assets.removeFromGallery")).toEqual({ galleryItemId: "galleryitem_ct_1" });
});

test("P2: cancelling the confirm removes nothing", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const trpc = await routeTrpc(page, {
    "assets.listGallery": () => [ITEM],
    "assets.removeFromGallery": () => null,
  });

  await mount(<CharacterGalleryDialogStory />);
  await openLightbox(page);

  await page.getByRole("button", { name: "Remove from gallery" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await expect(page.getByText("Remove this image?")).toHaveCount(0);
  await expect.poll(() => trpc.count("assets.removeFromGallery")).toBe(0);
  // The lightbox is still open — cancel is a no-op on the image itself.
  await expect(page.getByRole("button", { name: "Remove from gallery" })).toBeVisible();
});

async function selectOwnedImages(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Add images" }).first().click();
  await expect(page.getByText("Add images to the gallery")).toBeVisible();
  // The picker names each cell `${kind} image`; OWNED is `kind: "gallery"`.
  const cells = page.getByRole("gridcell", { name: "gallery image", exact: true });
  await expect(cells).toHaveCount(2);
  await cells.nth(0).click();
  await cells.nth(1).click();
  await expect(page.getByText("2 selected")).toBeVisible();
}

test("the add picker owns the whole held batch, ignores repeat confirmation, and closes after every success", async ({ mount, page }) => {
  const hold = trpcHold();
  const trpc = await routeTrpc(page, {
    "assets.listGallery": () => [],
    "assets.listOwned": () => OWNED,
    "assets.addToGallery": hold,
  });
  await mount(<CharacterGalleryDialogStory />);
  await selectOwnedImages(page);
  const confirm = page.getByRole("button", { name: "Add selected" });

  await confirm.evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await hold.requested;

  await expect(confirm).toBeDisabled();
  await expect(page.getByText("Add images to the gallery")).toBeVisible();
  await expect.poll(() => trpc.count("assets.addToGallery")).toBe(2);

  hold.release(ITEM);
  await expect(page.getByText("Add images to the gallery")).toHaveCount(0);
});

test("a rejected add batch stays visible and retryable, then closes after the retry succeeds", async ({ mount, page }) => {
  const rejected = trpcHold();
  const retry = trpcHold();
  let attempts = 0;
  await routeTrpc(page, {
    "assets.listGallery": () => [],
    "assets.listOwned": () => OWNED,
    "assets.addToGallery": () => (attempts++ < OWNED.length ? rejected : retry),
  });
  await mount(<CharacterGalleryDialogStory />);
  await selectOwnedImages(page);
  const confirm = page.getByRole("button", { name: "Add selected" });

  await confirm.click();
  await rejected.requested;
  rejected.release(trpcError());

  await expect(page.getByRole("alert")).toContainText("Couldn't add the selected images to the gallery.");
  await expect(confirm).toBeEnabled();
  await expect(page.getByText("Add images to the gallery")).toBeVisible();

  await confirm.click();
  await retry.requested;
  retry.release(ITEM);
  await expect(page.getByText("Add images to the gallery")).toHaveCount(0);
});

// #1501 — THE LIGHTBOX CLOSES ON THE REMOVAL, NOT ON THE REQUEST. It was dismissed on the same tick as
// `.mutate`, so a rejected remove put the reader back at a grid that still showed the image they had just
// confirmed deleting, with nothing to retry from.
//
// THE RETRY SURFACE IS NOW THE CONFIRM ITSELF, AND BOTH READINGS ARE KEPT (#1563 changed #1501's input).
//   WHAT THIS PIN USED TO SAY, verbatim: "THE CONFIRM IS NOT THE RETRY SURFACE, AND CANNOT BE:
//     `components/confirm-dialog.tsx:37` records that the dialog closes itself via AlertDialogClose
//     regardless of outcome — a shared-component ruling this lane did not touch. So the reachable, and
//     correct, retry surface is the LIGHTBOX, which carries the Remove button."
//   WHAT CHANGED: that shared-component ruling was the DEFECT #1563 filed and fixed. `ConfirmDialog` now
//     waits on the settle a caller returns, so the confirm holds open on rejection with the reason and its
//     own button as the retry. The SYMPTOM #1501 filed is unchanged and still pinned — a rejected remove
//     must never dump the reader at a grid that still shows the image with nothing to press — but the
//     surface that answers it is one level nearer the act.
//   THE LIGHTBOX IS STILL THERE, and this asserts that too: it is behind a modal dialog (Base UI hides the
//     rest of the document from the a11y tree while one is open, which is why the role query for its button
//     only resolves once the confirm is dismissed), so the reader who cancels lands exactly where #1501
//     said they must.
test("a REJECTED remove holds the CONFIRM open as the retry, over a lightbox that survives (#1501 · #1563)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "assets.listGallery": () => [ITEM],
    "assets.removeFromGallery": () => trpcError({ message: "remove failed" }),
  });

  await mount(<CharacterGalleryDialogStory />);
  await openLightbox(page);
  await page.getByRole("button", { name: "Remove from gallery" }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("button", { name: "Remove", exact: true }).click();

  await expect.poll(() => trpc.count("assets.removeFromGallery"), { intervals: [20, 50, 100] }).toBe(1);
  // The confirm states the failure and is still standing — its own Remove is the retry.
  await expect(confirm.locator('[data-slot="confirm-dialog-failure"]')).toContainText("remove failed");
  await expect(confirm.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
  // …and the image is still in the grid behind it, which is the half #1501 filed.
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Remove from gallery" })).toBeVisible();
});

// ONE FAILURE SURFACE PER PRESS (#1563a). #1563 gave the confirm its own inline failure line — and left
// `useRemoveFromGallery`'s `errorToast` in place, so a single refused remove said the same thing TWICE: once
// in the dialog the reader is looking at, once in a global toast over it. A verb whose only caller owns a
// retry surface does not also owe a toast; the mutation drops the `errorToast` and the confirm is the one
// place the refusal is said.
//
// This test needs the OTHER provider stack: `CtDataProviders`' plain QueryClient has no MutationCache error
// channel at all, so the toast half is INVISIBLE on it and the count would read 1 before the fix as well.
test("a refused remove produces exactly ONE failure surface — the confirm's line, no toast over it (#1563)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "assets.listGallery": () => [ITEM],
    "assets.removeFromGallery": () => trpcError({ message: "remove failed" }),
  });

  await mount(<CharacterGalleryDialogToastStory />);
  await openLightbox(page);
  await page.getByRole("button", { name: "Remove from gallery" }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("button", { name: "Remove", exact: true }).click();

  await expect.poll(() => trpc.count("assets.removeFromGallery"), { intervals: [20, 50, 100] }).toBe(1);
  // The surface that IS owed: the confirm's own line, beside the button that retries it.
  await expect(confirm.locator('[data-slot="confirm-dialog-failure"]')).toContainText("remove failed");
  // …and the one that is NOT owed. Observed as the toast ROOT, the house idiom
  // (`use-tag-suggestion-mutations.ct.tsx`) — a text query would answer 0 for a toast that rendered with
  // different copy, which is the false clean. Control receipt: with the `errorToast` still on the mutation
  // this same locator resolved to 1, so the instrument is live and the zero below is a measurement.
  await expect(page.locator(TOAST_ROOT)).toHaveCount(0);
});

// …and the other direction, so a fix that simply stops closing cannot pass.
test("a SUCCESSFUL remove closes both the confirm and the lightbox (#1501, the other direction)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "assets.listGallery": () => [ITEM], "assets.removeFromGallery": () => null });

  await mount(<CharacterGalleryDialogStory />);
  await openLightbox(page);
  await page.getByRole("button", { name: "Remove from gallery" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove", exact: true }).click();

  await expect.poll(() => trpc.count("assets.removeFromGallery"), { intervals: [20, 50, 100] }).toBe(1);
  await expect(page.getByRole("button", { name: "Remove from gallery" })).toHaveCount(0);
});

// A PARTIAL BATCH LEAVES ONLY WHAT IS STILL OUTSTANDING SELECTED (#1501). The picker's selection was never
// pruned, so the obvious next move — press Add again — re-submitted every asset including the ones already
// in the gallery. The batch is per-asset, so the honest retry set is exactly the rejected ones.
test("a PARTIAL add prunes the selection to what did not land (#1501)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "assets.listGallery": () => [],
    "assets.listOwned": () => OWNED,
    // The FIRST asset lands, the second does not — and which is which is the whole claim.
    "assets.addToGallery": (input: TrpcInput<"assets.addToGallery">) => (input?.assetId === FAILING_ASSET ? trpcError({ message: "add failed" }) : ITEM),
  });

  await mount(<CharacterGalleryDialogStory />);
  // `.first()`: an EMPTY gallery renders its own "Add images" CTA as well as the header's, and this test
  // deliberately starts empty so the picker's candidates are the two owned assets.
  await page.getByRole("button", { name: "Add images" }).first().click();
  const picker = page.getByRole("dialog").filter({ hasText: "Add images to the gallery" });
  await picker.getByRole("gridcell").first().click();
  await picker.getByRole("gridcell").nth(1).click();
  await expect(picker.getByText("2 selected")).toBeVisible();

  await picker.getByRole("button", { name: "Add selected" }).click();
  await expect.poll(() => trpc.count("assets.addToGallery"), { intervals: [20, 50, 100] }).toBe(2);

  // Exactly one is still outstanding, and the copy says how the batch actually went.
  await expect(picker.getByText("1 selected")).toBeVisible();
  await expect(picker.getByText("Added 1 of 2", { exact: false })).toBeVisible();

  // …and pressing Add again re-submits ONLY that one — the defect was re-submitting the whole set.
  await picker.getByRole("button", { name: "Add selected" }).click();
  await expect.poll(() => trpc.count("assets.addToGallery"), { intervals: [20, 50, 100] }).toBe(3);
});

// ── THE ROOM FILTER (item 0024 part 6). The grid's scope strip narrows the gallery to pictures generated in
// the chat the dialog was opened from. The server applies `chatId` inside the caller's own gallery (the
// cross-tenant refusal is pinned in `list-gallery.int.test.ts`); these pin that the client sends it only for
// "This chat", keeps the character scope, and reads an empty or failed room scope honestly.

/** The chat `CharacterGalleryDialogStory` opens the dialog from (`fixtures.ts` `CHAT_ID`). */
const STORY_CHAT_ID = "chat_ct_keystone";
const ROOM_ITEM = { ...ITEM, galleryItemId: "galleryitem_ct_room", assetId: "asset_ct_room", hash: "d".repeat(64) };

function galleryFor(input: TrpcInput<"assets.listGallery">): TrpcWireOutput<"assets.listGallery"> {
  return input?.chatId === STORY_CHAT_ID ? [ROOM_ITEM] : [ITEM, ROOM_ITEM];
}

test("the scope strip starts on Everywhere and 'This chat' re-reads the gallery for this chat only", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "assets.listGallery": galleryFor });
  await mount(<CharacterGalleryDialogStory />);

  const strip = page.getByRole("radiogroup", { name: "Show images from" });
  await expect(strip.getByRole("radio", { name: "Everywhere" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("gridcell", { name: "Gallery image" })).toHaveCount(2);
  await expect
    .poll(() => trpc.lastInput("assets.listGallery"))
    .toEqual({ subjectCharacterId: "character_ct_gallery", limit: 100, sort: "newest", direction: "forward" });

  await strip.getByRole("radio", { name: "This chat" }).click();
  await expect(strip.getByRole("radio", { name: "This chat" })).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(() => trpc.lastInput("assets.listGallery"))
    .toEqual({ subjectCharacterId: "character_ct_gallery", chatId: STORY_CHAT_ID, limit: 100, sort: "newest", direction: "forward" });
  await expect(page.getByRole("gridcell", { name: "Gallery image" })).toHaveCount(1);
});

test("an empty 'This chat' scope says so and offers the way back to everywhere", async ({ mount, page }) => {
  await routeTrpc(page, { "assets.listGallery": (input: TrpcInput<"assets.listGallery">) => (input?.chatId === undefined ? [ITEM] : []) });
  await mount(<CharacterGalleryDialogStory />);

  await page.getByRole("radio", { name: "This chat" }).click();
  await expect(page.getByText("No images from this chat")).toBeVisible();
  await page.getByRole("button", { name: "Show everywhere" }).click();
  await expect(page.getByRole("radio", { name: "Everywhere" })).toHaveAttribute("aria-checked", "true");
  // The button unmounts with the empty state; focus lands on the radio it selected, never the dialog shell.
  await expect(page.getByRole("radio", { name: "Everywhere" })).toBeFocused();
  await expect(page.getByRole("gridcell", { name: "Gallery image" })).toHaveCount(1);
});

// A full gallery everywhere and none in this chat: the largest height change the scope strip can cause. Enough
// rows to reach the grid's height cap at the desktop dialog's width, where a dozen fit in the empty state's height.
const FULL_GALLERY = Array.from({ length: 40 }, (_, index) => ({
  ...ITEM,
  galleryItemId: `galleryitem_ct_full_${String(index)}`,
  assetId: `asset_ct_full_${String(index)}`,
  hash: index.toString(16).padStart(2, "0").repeat(32),
}));

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 360, height: 780 },
] as const) {
  test(`${viewport.name}: switching to an empty 'This chat' leaves the heading and the scope strip where they were`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await routeTrpc(page, { "assets.listGallery": (input: TrpcInput<"assets.listGallery">) => (input?.chatId === undefined ? FULL_GALLERY : []) });
    await mount(<CharacterGalleryDialogStory />);

    const heading = page.getByRole("dialog").getByRole("heading").first();
    const strip = page.getByRole("radiogroup", { name: "Show images from" });
    await expect(page.getByRole("gridcell", { name: "Gallery image" }).first()).toBeVisible();
    // Read the first position after the popup's open motion has settled, or a transform skews it.
    await expect
      .poll(() =>
        page
          .locator('[data-slot="dialog-popup"]')
          .first()
          .evaluate((el) => el.getAnimations().length),
      )
      .toBe(0);
    const tops = async (): Promise<readonly number[]> => [(await heading.boundingBox())?.y ?? Number.NaN, (await strip.boundingBox())?.y ?? Number.NaN];
    const before = await tops();

    await strip.getByRole("radio", { name: "This chat" }).click();
    await expect(page.getByText("No images from this chat")).toBeVisible();
    // Past the popup's own open/resize motion: the reading is the settled layout.
    await expect.poll(tops).toEqual(before);
  });
}

test("a failed gallery read shows its error state, never 'No images yet'", async ({ mount, page }) => {
  await routeTrpc(page, { "assets.listGallery": () => trpcError({ message: "gallery boom" }) });
  await mount(<CharacterGalleryDialogStory />);

  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByText("No images yet")).toHaveCount(0);
});

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "narrow", width: 900, height: 800 },
  { name: "mobile", width: 390, height: 844 },
] as const) {
  test(`${viewport.name}: the scope strip sits inside the dialog and inside the viewport`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await routeTrpc(page, { "assets.listGallery": galleryFor });
    await mount(<CharacterGalleryDialogStory />);

    const strip = page.getByRole("radiogroup", { name: "Show images from" });
    await expect(strip).toBeVisible();
    await expect(strip).toBeInViewport({ ratio: 1 });
    await expect
      .poll(() =>
        strip.evaluate((el: HTMLElement) => {
          const dialog = el.closest('[role="dialog"]');
          const own = el.getBoundingClientRect();
          const box = dialog === null ? own : dialog.getBoundingClientRect();
          return own.left >= box.left - 1 && own.right <= box.right + 1;
        }),
      )
      .toBe(true);
  });
}

// ── PAGING AND DATE ORDER (item 0236 gap 4). The grid reads one keyset page of 100; "Load more" asks for the
// next page from the last row's `(createdAt, galleryItemId)`, and leaves once a short page ends the list. The
// order strip re-reads the gallery in the other date order from the first page.

const PAGE_SIZE = 100;
const SECOND_PAGE = 20;

/** Gallery row `index` of a newest-first gallery: every row one millisecond older than the one before it. */
function pagedItem(index: number): TrpcWireOutput<"assets.listGallery">[number] {
  return {
    ...ITEM,
    galleryItemId: `galleryitem_ct_page_${String(index).padStart(3, "0")}`,
    assetId: `asset_ct_page_${String(index)}`,
    hash: index.toString(16).padStart(4, "0").repeat(16),
    createdAt: 10_000 - index,
  };
}

const NEWEST_FIRST = Array.from({ length: PAGE_SIZE + SECOND_PAGE }, (_, index) => pagedItem(index));

/** Serves `NEWEST_FIRST` (or its reverse for `oldest`) a page at a time, continuing after the cursor's row. */
function pagedGallery(input: TrpcInput<"assets.listGallery">): TrpcWireOutput<"assets.listGallery"> {
  const ordered = input?.sort === "oldest" ? [...NEWEST_FIRST].reverse() : NEWEST_FIRST;
  const cursor = input?.cursor;
  const start = cursor === undefined ? 0 : ordered.findIndex((item) => item.galleryItemId === cursor.galleryItemId) + 1;
  return ordered.slice(start, start + PAGE_SIZE);
}

/** How many gallery rows the grid lays out: its ARIA row count at its ARIA column count. */
async function gridCapacity(page: Page): Promise<{ readonly rows: number; readonly columns: number }> {
  const grid = page.getByRole("grid", { name: "Aria's gallery" });
  return { rows: Number(await grid.getAttribute("aria-rowcount")), columns: Number(await grid.getAttribute("aria-colcount")) };
}

for (const viewport of [
  { name: "mobile", width: 360, height: 780 },
  { name: "desktop", width: 1440, height: 900 },
] as const) {
  test(`${viewport.name}: Load more reads the next page after the last row, and leaves at the end of the gallery`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const trpc = await routeTrpc(page, { "assets.listGallery": pagedGallery });
    await mount(<CharacterGalleryDialogStory />);

    const loadMore = page.getByRole("button", { name: "Load more" });
    await expect(loadMore).toBeVisible();
    await expect(loadMore).toBeInViewport();
    await expect.poll(async () => (await gridCapacity(page)).rows * (await gridCapacity(page)).columns).toBeGreaterThanOrEqual(PAGE_SIZE);
    await loadMore.click();

    const lastOfFirstPage = NEWEST_FIRST[PAGE_SIZE - 1];
    await expect
      .poll(() => trpc.lastInput("assets.listGallery"))
      .toEqual({
        subjectCharacterId: "character_ct_gallery",
        limit: PAGE_SIZE,
        sort: "newest",
        cursor: { createdAt: lastOfFirstPage?.createdAt, galleryItemId: lastOfFirstPage?.galleryItemId },
        direction: "forward",
      });
    // Both pages are in the grid, and the short second page ended the list.
    await expect.poll(async () => (await gridCapacity(page)).rows).toBe(Math.ceil((PAGE_SIZE + SECOND_PAGE) / (await gridCapacity(page)).columns));
    await expect(loadMore).toHaveCount(0);
  });

  test(`${viewport.name}: the order strip re-reads the gallery oldest first from the first page`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const trpc = await routeTrpc(page, { "assets.listGallery": pagedGallery });
    await mount(<CharacterGalleryDialogStory />);

    const order = page.getByRole("radiogroup", { name: "Order" });
    await expect(order).toBeInViewport({ ratio: 1 });
    await expect(order.getByRole("radio", { name: "Newest first" })).toHaveAttribute("aria-checked", "true");
    const firstCell = page.getByRole("gridcell", { name: "Gallery image" }).first().locator("img");
    const newest = NEWEST_FIRST[0];
    const oldest = NEWEST_FIRST.at(-1);
    await expect(firstCell).toHaveAttribute("src", new RegExp(newest?.hash ?? "missing", "u"));

    await order.getByRole("radio", { name: "Oldest first" }).click();
    await expect(order.getByRole("radio", { name: "Oldest first" })).toHaveAttribute("aria-checked", "true");
    await expect
      .poll(() => trpc.lastInput("assets.listGallery"))
      .toEqual({ subjectCharacterId: "character_ct_gallery", limit: PAGE_SIZE, sort: "oldest", direction: "forward" });
    await expect(firstCell).toHaveAttribute("src", new RegExp(oldest?.hash ?? "missing", "u"));
  });
}

// ── UPLOAD AND DROP (item 0236 gap 2). The dialog takes picked or dropped images straight into the gallery:
// the shared asset upload (kind `gallery`), then `assets.addToGallery` for this character. The dropzone
// refuses a wrong type or an oversize file on its own line and uploads nothing; a server refusal names the
// file. The image cap is served by `/api/auth/config`, stubbed small here so an oversize file stays tiny.

const UPLOAD_ROUTE = "**/api/assets/upload";
const IMAGE_CAP_BYTES = 64;
const UPLOADED = { assetId: "asset_01h455vb4pex5vsknk084sn02q", hash: "9f2c4b1e".repeat(8), size: 8, created: true };
const UPLOADED_ITEM = { ...ITEM, galleryItemId: "galleryitem_ct_uploaded", assetId: UPLOADED.assetId, hash: UPLOADED.hash };
const SMALL_PNG = { name: "sunset.png", mimeType: "image/png", content: "PNGBYTES" };
const LARGE_PNG = { name: "poster.png", mimeType: "image/png", content: "P".repeat(IMAGE_CAP_BYTES + 1) };
const NOT_AN_IMAGE = { name: "notes.txt", mimeType: "text/plain", content: "hello" };

/** Serve the upload caps with a small image cap; the other caps are irrelevant to this dialog. */
async function capImageUploads(page: Page): Promise<void> {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({ json: { uploads: { assetUpload: 1_000_000, image: IMAGE_CAP_BYTES, databankUpload: 1_000_000, importTotal: 1_000_000 } } }),
  );
}

/** Record every upload POST's multipart body and answer it with `status` (a StoredAsset on 200). */
async function recordUploads(page: Page, status = 200): Promise<string[]> {
  const bodies: string[] = [];
  await page.route(UPLOAD_ROUTE, async (route) => {
    bodies.push(route.request().postData() ?? "");
    await route.fulfill(status === 200 ? { json: UPLOADED } : { status, json: { error: "not an image" } });
  });
  return bodies;
}

/** The gallery holds the uploaded picture once `addToGallery` has run for it. */
function galleryAfterAdd(added: () => boolean): () => TrpcWireOutput<"assets.listGallery"> {
  return () => (added() ? [UPLOADED_ITEM] : []);
}

const DROPZONE = '[role="dialog"] [data-slot="file-dropzone"]';

for (const viewport of [
  { name: "mobile", width: 360, height: 780 },
  { name: "desktop", width: 1440, height: 900 },
] as const) {
  test(`${viewport.name}: a picked image uploads as a gallery asset and joins this character's gallery`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await capImageUploads(page);
    const uploads = await recordUploads(page);
    let added = false;
    const trpc = await routeTrpc(page, {
      "assets.listGallery": galleryAfterAdd(() => added),
      "assets.addToGallery": () => {
        added = true;
        return UPLOADED_ITEM;
      },
    });
    await mount(<CharacterGalleryDialogStory />);

    await expect(page.getByText("No images yet")).toBeVisible();
    const zone = page.locator(DROPZONE);
    await expect(zone).toBeInViewport();
    await expect(zone.getByText(`Up to ${String(IMAGE_CAP_BYTES)} B per file`)).toBeVisible();
    await zone.locator('input[type="file"]').setInputFiles({ name: SMALL_PNG.name, mimeType: SMALL_PNG.mimeType, buffer: Buffer.from(SMALL_PNG.content) });

    await expect(page.getByRole("gridcell", { name: "Gallery image" })).toHaveCount(1);
    await expect.poll(() => uploads.length).toBe(1);
    await expect.poll(() => uploads[0]).toMatch(/name="kind"\s+gallery/u);
    await expect.poll(() => trpc.lastInput("assets.addToGallery")).toEqual({ assetId: UPLOADED.assetId, subjectCharacterId: "character_ct_gallery" });
  });

  test(`${viewport.name}: a dropped image takes the same path into the gallery`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await capImageUploads(page);
    const uploads = await recordUploads(page);
    let added = false;
    const trpc = await routeTrpc(page, {
      "assets.listGallery": galleryAfterAdd(() => added),
      "assets.addToGallery": () => {
        added = true;
        return UPLOADED_ITEM;
      },
    });
    await mount(<CharacterGalleryDialogStory />);

    const zone = page.locator(DROPZONE);
    await expect(zone.getByText(`Up to ${String(IMAGE_CAP_BYTES)} B per file`)).toBeVisible();
    await dropFiles(zone, [SMALL_PNG]);

    await expect(page.getByRole("gridcell", { name: "Gallery image" })).toHaveCount(1);
    await expect.poll(() => uploads.length).toBe(1);
    await expect.poll(() => trpc.lastInput("assets.addToGallery")).toEqual({ assetId: UPLOADED.assetId, subjectCharacterId: "character_ct_gallery" });
  });

  test(`${viewport.name}: a wrong type or an oversize image is refused on the dropzone's line and nothing uploads`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await capImageUploads(page);
    const uploads = await recordUploads(page);
    const trpc = await routeTrpc(page, { "assets.listGallery": () => [], "assets.addToGallery": () => UPLOADED_ITEM });
    await mount(<CharacterGalleryDialogStory />);

    const zone = page.locator(DROPZONE);
    await expect(zone.getByText(`Up to ${String(IMAGE_CAP_BYTES)} B per file`)).toBeVisible();
    await dropFiles(zone, [NOT_AN_IMAGE, LARGE_PNG]);

    await expect(page.getByText(`notes.txt isn't an accepted file type · poster.png exceeds the ${String(IMAGE_CAP_BYTES)} B limit`)).toBeVisible();
    await expect.poll(() => uploads.length).toBe(0);
    await expect.poll(() => trpc.count("assets.addToGallery")).toBe(0);
  });

  test(`${viewport.name}: an upload whose gallery add fails is named on one line, with no success mark and no toast`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await capImageUploads(page);
    const uploads = await recordUploads(page);
    const trpc = await routeTrpc(page, { "assets.listGallery": () => [], "assets.addToGallery": () => trpcError({ code: "NOT_FOUND", message: "not found" }) });
    await mount(<CharacterGalleryDialogToastStory />);

    const zone = page.locator(DROPZONE);
    await expect(zone.getByText(`Up to ${String(IMAGE_CAP_BYTES)} B per file`)).toBeVisible();
    await dropFiles(zone, [SMALL_PNG]);

    const line = page.getByRole("alert").filter({ hasText: "sunset.png uploaded but couldn't join Aria's gallery. It stays in your uploads." });
    await expect(line).toBeVisible();
    await expect(line).toBeInViewport();
    await expect.poll(() => uploads.length).toBe(1);
    await expect.poll(() => trpc.count("assets.addToGallery")).toBe(1);
    // The upload landed but the picture joined nothing: the zone claims no success, and the line is the one surface.
    await expect(zone).not.toHaveAttribute("data-success", "");
    // A retrying toHaveCount(0) passes before a late toast paints. The mutation cache's toast hook runs before
    // the rejection reaches the zone, so two frames past the rendered line is a settled read.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — the toast hook fired before the line rendered, and two frames have painted since.
    expect(await page.locator(TOAST_ROOT).count()).toBe(0);
  });

  test(`${viewport.name}: an image the server refuses is named, and nothing joins the gallery`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await capImageUploads(page);
    const uploads = await recordUploads(page, 415);
    const trpc = await routeTrpc(page, { "assets.listGallery": () => [], "assets.addToGallery": () => UPLOADED_ITEM });
    await mount(<CharacterGalleryDialogStory />);

    const zone = page.locator(DROPZONE);
    await expect(zone.getByText(`Up to ${String(IMAGE_CAP_BYTES)} B per file`)).toBeVisible();
    await dropFiles(zone, [SMALL_PNG]);

    await expect(page.getByRole("alert").filter({ hasText: "Couldn't upload sunset.png." })).toBeVisible();
    await expect.poll(() => uploads.length).toBe(1);
    await expect.poll(() => trpc.count("assets.addToGallery")).toBe(0);
  });
}

test("the add-picker with nothing left to add points back to the gallery's upload zone", async ({ mount, page }) => {
  // The one image the viewer owns is the one already in the gallery.
  const owned = [
    { assetId: ITEM.assetId, hash: ITEM.hash, mime: "image/png", size: 1024, uploadedAt: 1, animated: false, kind: "gallery" },
  ] satisfies TrpcWireOutput<"assets.listOwned">;
  await routeTrpc(page, { "assets.listGallery": () => [ITEM], "assets.listOwned": () => owned });
  await mount(<CharacterGalleryDialogStory />);

  await page.getByRole("button", { name: "Add images" }).click();
  await expect(page.getByText("Nothing left to add")).toBeVisible();
  await page.getByRole("button", { name: "Upload instead" }).click();
  await expect(page.getByRole("heading", { name: "Add images to the gallery" })).toHaveCount(0);
  await expect(page.locator(DROPZONE)).toBeVisible();
});
