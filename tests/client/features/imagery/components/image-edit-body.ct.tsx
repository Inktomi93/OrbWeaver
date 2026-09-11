// image-edit-body CT (interaction-direction-spec.md §7 B5) — img2img. An instruction drives
// imagery.editImage with the source asset + instruction; on success the modal hands off to the detail body on
// the freshly-edited asset (proven by the detail body's Set-as-background action appearing).

import { blobUrl } from "@orb/contracts/assets";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { holdPortraitImage, layoutBox, PORTRAIT_H, PORTRAIT_RATIO, PORTRAIT_W } from "../../../../support/browser/held-portrait-image.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { seedActiveChat } from "../../../../support/node/seed-active-chat.ts";
import { RoomImageDetailStory } from "../../chat/_ct-stories.tsx";
import { EditFlowStory, EditToastStory } from "../_ct-stories.tsx";

/** The production toast outlet's root — the only place the post-success resolve failure can be observed. */
const TOAST_ROOT = '[data-slot="toast-root"]';

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// #622 — a 1024×1536 PORTRAIT source (the `portrait` size preset) as an SVG data URL: it carries its own
// intrinsic size, so the browser reports naturalWidth/naturalHeight with no network. `EditFlowStory`'s
// subject carries NO `dims` (the genuinely-unknown case, still legal after #654 wired the reserving one), so
// the SOURCE image renders on the primitive's no-dims path — it must still render, and an edit surface that
// shows a distorted source is the worst place to lie about what the image looks like.
const PORTRAIT_SVG = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536"><rect width="1024" height="1536" fill="#222"/><circle cx="512" cy="512" r="400" fill="#eee"/></svg>',
)}`;
const RATIO_PRECISION = 2;
const VIEWPORTS = [
  { label: "desktop", width: 1280, height: 900 },
  { label: "mobile", width: 390, height: 844 },
] as const;

for (const vp of VIEWPORTS) {
  test(`#622 (${vp.label}): the edit modal's source image paints at its own 2:3 ratio`, async ({ mount, page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const chatId = mintTypeId(ID_PREFIX.chat);
    const assetId = mintTypeId(ID_PREFIX.asset);
    await routeTrpc(page, {});
    const cmp = await mount(<EditFlowStory assetId={assetId} chatId={chatId} url={PORTRAIT_SVG} />);
    const img = cmp.locator('[data-slot="message-media"]');
    // Barrier on the SETTLED (decoded) image — an <img> with no intrinsic size yet lays out at 0×0.
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth / (el as HTMLImageElement).naturalHeight))
      .toBeCloseTo(PORTRAIT_RATIO, RATIO_PRECISION);
    const box = await img.boundingBox();
    expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(PORTRAIT_RATIO, RATIO_PRECISION);
  });
}

// ── #654: the RESERVATION arm, driven through the chain a source image actually travels ────────────────
// transcript image → detail modal → "Edit image". The edit body reads the SAME `ImageSubject` the detail
// body was opened with, so this fails if the mint site, the store field, or this body's forward is missing.
// The url is held permanently pending, so the box measured is the pre-decode one.
const PENDING_EDIT_SRC = "/blob/ct-654-pending-edit-portrait.png";
const MIN_RESERVED_PX = 1;

for (const vp of VIEWPORTS) {
  test(`#654 (${vp.label}): the edit modal reserves the source image's true box before the bytes arrive`, async ({ mount, page }) => {
    await seedActiveChat(page, mintTypeId(ID_PREFIX.chat));
    // routeTrpc FIRST: page routes resolve LIFO, so the image route must be registered after it or it
    // would swallow the tRPC handler's turn.
    await routeTrpc(page, { "imagery.readProvenance": null });
    const release = await holdPortraitImage(page, PENDING_EDIT_SRC);
    await page.setViewportSize({ width: vp.width, height: vp.height });

    const cmp = await mount(<RoomImageDetailStory reservedSrc={PENDING_EDIT_SRC} />);
    await cmp.locator('[data-slot="message-media"]').first().click();
    await cmp.getByRole("button", { name: "Edit image" }).click();
    // Barrier on the SETTLED edit body — its instruction field is the tell.
    await expect(cmp.getByRole("textbox", { name: "Edit instruction" })).toBeVisible();

    // The edit body's source image is the LAST one on the page (the transcript block still renders above it).
    const source = cmp.locator('[data-slot="message-media"]').last();
    // Visible at all is the assertion that bites: a dims-less <img> with nothing decoded lays out 0×0.
    await expect(source).toBeVisible();
    const reserved = await layoutBox(source);
    expect(reserved.w / reserved.h).toBeCloseTo(PORTRAIT_RATIO, RATIO_PRECISION);
    expect(reserved.h).toBeGreaterThan(MIN_RESERVED_PX);

    // The claim in full: the reserved box IS the true box. Release the bytes, barrier on the DECODED
    // image, and the geometry must not have moved — that identity is what "no reflow" means.
    await release();
    await expect.poll(() => source.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(PORTRAIT_W);
    expect(await layoutBox(source)).toEqual(reserved);
  });
}

// #654 — the FOURTH wired site: the edit→detail HAND-OFF mints a brand-new subject from the resolver's own
// row, so the edited image must land in the detail modal already reserved. `resolveBlobRefs` carries the
// stored dimensions (`AssetBlobRef.width/height`), which is the only place this mint site can read them.
const EDITED_HASH = "cafed00d";

test("#654: the edit→detail hand-off carries the edited asset's stored dims into the detail modal", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const sourceAssetId = mintTypeId(ID_PREFIX.asset);
  const editedAssetId = mintTypeId(ID_PREFIX.asset);
  const generationId = mintTypeId(ID_PREFIX.imageryGeneration);
  await routeTrpc(page, {
    "imagery.editImage": {
      images: [
        { assetId: editedAssetId, generationId, block: { kind: "media", media: "image", alt: "edited", src: { kind: "asset", assetId: editedAssetId } } },
      ],
      prompt: "make it night",
      promptSource: "user",
      mode: "free",
      model: "gpt-image-1",
      costUsd: 0.05,
      reused: false,
      warnings: [],
    },
    "assets.resolveBlobRefs": [{ assetId: editedAssetId, hash: EDITED_HASH, mime: "image/png", width: PORTRAIT_W, height: PORTRAIT_H }],
    "imagery.readProvenance": null,
  });
  // The edited asset's blob url, held pending so the hand-off's box is the pre-decode one.
  const release = await holdPortraitImage(page, blobUrl(EDITED_HASH));
  const cmp = await mount(<EditFlowStory assetId={sourceAssetId} chatId={chatId} url={PNG} />);

  await cmp.getByRole("textbox", { name: "Edit instruction" }).fill("make it night");
  await cmp.getByRole("button", { name: "Generate edit" }).click();
  // Barrier on the SETTLED hand-off: the detail body's Set-as-background action is the tell.
  await expect(cmp.getByRole("button", { name: "Set as background" })).toBeVisible();

  const edited = cmp.locator('[data-slot="message-media"]');
  await expect(edited).toBeVisible();
  const reserved = await layoutBox(edited);
  expect(reserved.w / reserved.h).toBeCloseTo(PORTRAIT_RATIO, RATIO_PRECISION);
  expect(reserved.h).toBeGreaterThan(MIN_RESERVED_PX);

  await release();
  await expect.poll(() => edited.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(PORTRAIT_W);
  expect(await layoutBox(edited)).toEqual(reserved);
});

test("image edit: an instruction drives imagery.editImage and hands off to the detail body", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const sourceAssetId = mintTypeId(ID_PREFIX.asset);
  const editedAssetId = mintTypeId(ID_PREFIX.asset);
  const generationId = mintTypeId(ID_PREFIX.imageryGeneration);
  const rec = await routeTrpc(page, {
    "imagery.editImage": {
      images: [
        { assetId: editedAssetId, generationId, block: { kind: "media", media: "image", alt: "edited", src: { kind: "asset", assetId: editedAssetId } } },
      ],
      prompt: "make it night",
      promptSource: "user",
      mode: "free",
      model: "gpt-image-1",
      costUsd: 0.05,
      reused: false,
      warnings: [],
    },
    // `width`/`height` null = the asset has no stored dimensions (a pre-#625 row, an unparseable header) —
    // the hand-off then mints a dims-less subject and the detail modal takes the placeholder aspect. The
    // no-dims arm of #654, asserted by this test still passing.
    "assets.resolveBlobRefs": [{ assetId: editedAssetId, hash: "deadbeef", mime: "image/png", width: null, height: null }],
    // The detail body the edit hands off to reads provenance for the new asset.
    "imagery.readProvenance": null,
  });
  const cmp = await mount(<EditFlowStory assetId={sourceAssetId} chatId={chatId} url={PNG} />);

  const instruction = cmp.getByRole("textbox", { name: "Edit instruction" });
  await expect(instruction).toBeVisible();
  await instruction.fill("make it night");
  await cmp.getByRole("button", { name: "Generate edit" }).click();

  await expect.poll(() => rec.count("imagery.editImage")).toBe(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding expect.poll(rec.count).toBe(1) barriers on the call being recorded, so this reads a settled input.
  expect(rec.lastInput("imagery.editImage")).toMatchObject({ sourceAssetId, instruction: "make it night", chatId });

  // Hand-off: the detail body appears on the edited asset (its Set-as-background action is the tell).
  await expect(cmp.getByRole("button", { name: "Set as background" })).toBeVisible();
});

// ── #702: a REJECTED resolve after a SUCCESSFUL edit must surface the partial success, never swallow it ──
// editImage succeeds (the asset is minted + owned server-side), then `resolveBlobRefs` REJECTS — a transient
// drop in the window right after a long generation. The old code let that fall into `.catch(() => undefined)`:
// no toast, the modal unchanged, so the host read a successful edit as a failure and paid for a duplicate. The
// fix wraps the resolve in its own try/catch and toasts "saved, but couldn't open it here", keeping it DISTINCT
// from the edit-failed errorToast. Runs on `EditToastStory` — the only stack where the toast channel exists.
test("#702: a resolve failure after a successful edit toasts the partial success (saved, not openable), not silence", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const sourceAssetId = mintTypeId(ID_PREFIX.asset);
  const editedAssetId = mintTypeId(ID_PREFIX.asset);
  const generationId = mintTypeId(ID_PREFIX.imageryGeneration);
  await routeTrpc(page, {
    "imagery.editImage": {
      images: [
        { assetId: editedAssetId, generationId, block: { kind: "media", media: "image", alt: "edited", src: { kind: "asset", assetId: editedAssetId } } },
      ],
      prompt: "make it night",
      promptSource: "user",
      mode: "free",
      model: "gpt-image-1",
      costUsd: 0.05,
      reused: false,
      warnings: [],
    },
    // The edit committed; the READ-BACK of its blob url fails — the exact post-success window #702 names.
    "assets.resolveBlobRefs": () => trpcError({ code: "SERVICE_UNAVAILABLE", message: "resolve dropped" }),
    "imagery.readProvenance": null,
  });
  const cmp = await mount(<EditToastStory assetId={sourceAssetId} chatId={chatId} url={PNG} />);

  await cmp.getByRole("textbox", { name: "Edit instruction" }).fill("make it night");
  await cmp.getByRole("button", { name: "Generate edit" }).click();

  // The partial-success toast IS shown — saved, just not openable here (the gallery hand-off line).
  const toasts = page.locator(TOAST_ROOT);
  await expect(toasts).toContainText("Couldn't open it here");
  // And it is NOT the edit-failed message — the edit succeeded, only the display failed. That distinction is
  // the whole point: `errorToast: "Couldn't edit the image."` must be nowhere on the page.
  await expect(page.getByText("Couldn't edit the image.", { exact: false })).toBeHidden();
  // The hand-off did NOT happen (no resolved ref), so the modal stays on the edit surface, not the detail body.
  await expect(cmp.getByRole("button", { name: "Set as background" })).toBeHidden();
});
