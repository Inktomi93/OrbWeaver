// CT: the per-character gallery lightbox (features/chat/anchors/character-gallery-dialog.tsx) — the two
// side-eye fixes. (a) P0 geometry: the lightbox pins its title + action row and scrolls ONLY the image
// body, so "Remove from gallery" and "Close" stay ON-SCREEN at 1280×800 (and the tighter 1366×768) where
// the old fixed square pushed them past the fold of the non-scrolling popup. (b) P2 destructive-confirm:
// removal now goes through an AlertDialog — `assets.removeFromGallery` does NOT fire on the first click,
// only after the explicit confirm (the chat-delete rule). Network is stubbed via routeTrpc.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
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
  const cells = page.getByRole("gridcell", { name: "upload image" });
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
    // The FIRST asset lands, the second does not — and which is which is the whole claim. Read through an
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
