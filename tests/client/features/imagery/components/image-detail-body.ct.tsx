// image-detail-body CT (interaction-direction-spec.md §7 B5) — the lightbox. The provenance strip shows
// readProvenance data; Set-as-background resolves the asset (assets.resolveBlobRefs) and writes the ONE
// applier (chat.setChatBackground) with the resolved hash/mime; Edit hands off to the edit body on the same
// asset (the mini-host swaps bodies off openModal).

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc.ts";
import { DetailFlowStory, DetailToastStory } from "../_ct-stories.tsx";

/** The production toast outlet's root — counting these is the whole #623 P1 assertion (the defect was TWO). */
const TOAST_ROOT = '[data-slot="toast-root"]';

// A 1×1 transparent PNG — an own-origin asset src the media primitive renders without a network fetch.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// #622 — a 1024×1536 PORTRAIT source (the `portrait` size preset) as an SVG data URL: it carries its own
// intrinsic size, so the browser reports naturalWidth/naturalHeight with no network. The detail lightbox
// passes NO `dims`, so this is the primitive's no-dims path — it must yield to the image's own ratio.
const PORTRAIT_SVG = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536"><rect width="1024" height="1536" fill="#222"/><circle cx="512" cy="512" r="400" fill="#eee"/></svg>',
)}`;
const PORTRAIT_RATIO = 1024 / 1536;
const RATIO_PRECISION = 2;
const VIEWPORTS = [
  { label: "desktop", width: 1280, height: 900 },
  { label: "mobile", width: 390, height: 844 },
] as const;

for (const vp of VIEWPORTS) {
  test(`#622 (${vp.label}): the detail lightbox paints a 1024×1536 image at its own 2:3 ratio`, async ({ mount, page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const chatId = mintTypeId(ID_PREFIX.chat);
    const assetId = mintTypeId(ID_PREFIX.asset);
    await routeTrpc(page, { "imagery.readProvenance": null });
    const cmp = await mount(<DetailFlowStory assetId={assetId} chatId={chatId} url={PORTRAIT_SVG} />);
    const img = cmp.locator('[data-slot="message-media"]');
    // Barrier on the SETTLED (decoded) image — an <img> with no intrinsic size yet lays out at 0×0.
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth / (el as HTMLImageElement).naturalHeight))
      .toBeCloseTo(PORTRAIT_RATIO, RATIO_PRECISION);
    const box = await img.boundingBox();
    expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(PORTRAIT_RATIO, RATIO_PRECISION);
  });
}

test("image detail: the provenance strip shows readProvenance data", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const assetId = mintTypeId(ID_PREFIX.asset);
  const generationId = mintTypeId(ID_PREFIX.imageryGeneration);
  await routeTrpc(page, {
    "imagery.readProvenance": {
      generationId,
      assetId,
      mode: "scenario",
      prompt: "a dim tavern, candlelight",
      negativePrompt: null,
      model: "gpt-image-1",
      costUsd: 0.04,
      subjectCharacterId: null,
      identityHash: null,
      edited: false,
      createdAt: 1_700_000_000_000,
    },
  });
  const cmp = await mount(<DetailFlowStory assetId={assetId} chatId={chatId} url={PNG} />);

  await expect(cmp.getByText("a dim tavern, candlelight")).toBeVisible();
  await expect(cmp.getByText("gpt-image-1")).toBeVisible();
  await expect(cmp.getByText("$0.0400")).toBeVisible();
});

test("image detail: Set as background resolves the asset and writes chat.setChatBackground", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const assetId = mintTypeId(ID_PREFIX.asset);
  const rec = await routeTrpc(page, {
    "imagery.readProvenance": null,
    "assets.resolveBlobRefs": [{ assetId, hash: "cafebabe", mime: "image/png" }],
    "chat.setChatBackground": { kind: "asset" },
  });
  const cmp = await mount(<DetailFlowStory assetId={assetId} chatId={chatId} url={PNG} />);

  const setBg = cmp.getByRole("button", { name: "Set as background" });
  await expect(setBg).toBeVisible();
  await setBg.click();

  await expect.poll(() => rec.count("chat.setChatBackground")).toBe(1);
  // ONESHOT-OK: the preceding expect.poll(rec.count).toBe(1) barriers on the call being recorded, so this reads a settled input.
  expect(rec.lastInput("chat.setChatBackground")).toMatchObject({
    chatId,
    background: { kind: "asset", assetId, assetHash: "cafebabe", mime: "image/png" },
  });
});

test("image detail: Edit image opens the edit body on the same asset", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const assetId = mintTypeId(ID_PREFIX.asset);
  await routeTrpc(page, { "imagery.readProvenance": null });
  const cmp = await mount(<DetailFlowStory assetId={assetId} chatId={chatId} url={PNG} />);

  await cmp.getByRole("button", { name: "Edit image" }).click();
  // The mini-host swaps to the edit body — its instruction field is the tell.
  await expect(cmp.getByRole("textbox", { name: "Edit instruction" })).toBeVisible();
});

test("#623: detail → edit is no longer a ONE-WAY door — Back returns to the same image", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const assetId = mintTypeId(ID_PREFIX.asset);
  await routeTrpc(page, { "imagery.readProvenance": null });
  const cmp = await mount(<DetailFlowStory assetId={assetId} chatId={chatId} url={PNG} />);

  await cmp.getByRole("button", { name: "Edit image" }).click();
  await expect(cmp.getByRole("textbox", { name: "Edit instruction" })).toBeVisible();
  // `openImageEdit` CLEARS `detailSubject`, so before #623 the only exit from here was Escape — straight to
  // the room, past the image the viewer came from. The return leg re-opens detail on the SAME subject.
  await cmp.getByRole("button", { name: "Back to the image" }).click();
  await expect(cmp.getByRole("button", { name: "Set as background" })).toBeVisible();
});

// ── #623 P1: the success toast used to fire before the write settled, and LIED on failure ──────────────
// `setBackground.mutate(...)` then `toast.add({title:"Set as chat background"})` on the next line, while the
// mutation carries `errorToast: "Couldn't set the chat background."` — a refused write (host-only gate, asset
// ownership) painted BOTH and the viewer could not tell which was true. These run on `DetailToastStory`,
// the only stack where both channels land on one manager, so a regression is countable rather than invisible.

test("#623: a REFUSED background write shows exactly ONE toast, and it is the failure", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const assetId = mintTypeId(ID_PREFIX.asset);
  await routeTrpc(page, {
    "imagery.readProvenance": null,
    "assets.resolveBlobRefs": [{ assetId, hash: "cafebabe", mime: "image/png" }],
    "chat.setChatBackground": () => trpcError({ code: "FORBIDDEN", message: "host only" }),
  });
  const cmp = await mount(<DetailToastStory assetId={assetId} chatId={chatId} url={PNG} />);
  await cmp.getByRole("button", { name: "Set as background" }).click();

  const toasts = page.locator(TOAST_ROOT);
  await expect(toasts).toHaveCount(1);
  await expect(toasts).toContainText("Couldn't set the chat background.");
  // The lie, spelled out: the success line must be nowhere on the page.
  await expect(page.getByText("Set as chat background", { exact: true })).toBeHidden();
});

test("#623: a SETTLED background write shows exactly ONE toast, and it names the revert home", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const assetId = mintTypeId(ID_PREFIX.asset);
  await routeTrpc(page, {
    "imagery.readProvenance": null,
    "assets.resolveBlobRefs": [{ assetId, hash: "cafebabe", mime: "image/png" }],
    "chat.setChatBackground": { kind: "asset" },
  });
  const cmp = await mount(<DetailToastStory assetId={assetId} chatId={chatId} url={PNG} />);
  await cmp.getByRole("button", { name: "Set as background" }).click();

  const toasts = page.locator(TOAST_ROOT);
  await expect(toasts).toHaveCount(1);
  // This repaints the whole room from a lightbox button; the toast is the only place that can say where to
  // undo it, and the revert home (context → "This chat" → Background) is real.
  await expect(toasts).toContainText("Change it any time in the This chat panel → Background.");
});
