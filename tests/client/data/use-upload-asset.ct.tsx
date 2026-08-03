// useUploadAsset CT (data/use-upload-asset.ts) — the ASSERT-THE-INVALIDATE-FIRED proof for the raw multipart
// upload seam. The upload route is a Hono multipart POST, not a tRPC mutation: it carries no `invalidates`
// and no bus event announces it, so `assets.listOwned` (the character gallery dialog's owned-asset picker)
// had NO freshness driver at all — with `staleTime: Infinity` an asset uploaded anywhere else in the session
// stayed missing from that grid until gcTime evicted the entry.
//
// What makes this a real proof and not a UI-reaction test: the mounted `listOwned` read is ACTIVE, so
// `invalidateQueries` doesn't just mark it stale — it REFETCHES, and routeTrpc counts the wire call. Delete
// the invalidate line from the hook and the second count never arrives. The upload route itself is stubbed
// at the network boundary (page.route), the same seam routeTrpc uses — never a hand-mock of `uploadAsset`.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../support/ct/route-trpc.ts";
import { UploadAssetStory } from "./_ct-stories.tsx";

const UPLOAD_URL = "**/api/assets/upload";
const STORED_HASH = "ctuploadhash0001";

/** Stub the multipart POST with a valid `storedAssetSchema` body (the hook parses it before invalidating). */
async function routeUpload(page: Page): Promise<() => number> {
  let calls = 0;
  await page.route(UPLOAD_URL, async (route) => {
    calls += 1;
    await route.fulfill({
      // A REAL TypeID suffix (26 chars, the base32 alphabet) — `storedAssetSchema` validates it client-side
      // before the hook invalidates, so a hand-waved id fails the parse instead of the assertion.
      json: { assetId: "asset_0123456789abcdefghjkmnpqrs", hash: STORED_HASH, size: 1, created: true },
    });
  });
  return () => calls;
}

test("a completed upload refetches the owned-asset list (the raw multipart seam's only freshness driver)", async ({ mount, page }) => {
  const uploadCount = await routeUpload(page);
  const trpc = await routeTrpc(page, { "assets.listOwned": () => [] });

  await mount(<UploadAssetStory />);
  await expect(page.getByTestId("owned-count")).toHaveText("rows=0");
  // The mount fetch must SETTLE before the upload: an invalidate landing on a still-in-flight FIRST fetch is
  // absorbed (query-core reuses the in-flight promise), which would fake a green.
  await expect.poll(() => trpc.count("assets.listOwned")).toBe(1);

  await page.getByRole("button", { name: "upload" }).click();

  await expect(page.getByTestId("upload-state")).toHaveText(`stored:${STORED_HASH}`);
  expect(uploadCount()).toBe(1);
  // The load-bearing assertion: a SECOND wire fetch of the list the upload just grew.
  await expect.poll(() => trpc.count("assets.listOwned")).toBe(2);
});

test("a FAILED upload invalidates nothing — nothing was minted, so nothing is stale", async ({ mount, page }) => {
  await page.route(UPLOAD_URL, async (route) => {
    await route.fulfill({ status: 500, json: { message: "scripted upload failure" } });
  });
  const trpc = await routeTrpc(page, { "assets.listOwned": () => [] });

  await mount(<UploadAssetStory />);
  await expect.poll(() => trpc.count("assets.listOwned")).toBe(1);

  await page.getByRole("button", { name: "upload" }).click();

  // The throw propagates to the caller (every feature owns its own failure UI) — the story records it.
  await expect(page.getByTestId("upload-state")).toContainText("failed:");
  // ONESHOT-OK: the failure text is rendered only AFTER the hook's promise rejected, i.e. after the point
  // where a success path would have invalidated — so any refetch it caused would already be recorded. A poll
  // would be wrong here (counts only climb; poll goes green on a value it merely transits).
  expect(trpc.count("assets.listOwned")).toBe(1);
});
