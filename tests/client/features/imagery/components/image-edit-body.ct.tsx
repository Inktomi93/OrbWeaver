// image-edit-body CT (interaction-direction-spec.md §7 B5) — img2img. An instruction drives
// imagery.editImage with the source asset + instruction; on success the modal hands off to the detail body on
// the freshly-edited asset (proven by the detail body's Set-as-background action appearing).

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { EditFlowStory } from "../_ct-stories.tsx";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// #622 — a 1024×1536 PORTRAIT source (the `portrait` size preset) as an SVG data URL: it carries its own
// intrinsic size, so the browser reports naturalWidth/naturalHeight with no network. The edit modal passes
// NO `dims`, so the SOURCE image renders on the primitive's no-dims path — and an edit surface that shows a
// distorted source is the worst place to lie about what the image looks like.
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
    "assets.resolveBlobRefs": [{ assetId: editedAssetId, hash: "deadbeef", mime: "image/png" }],
    // The detail body the edit hands off to reads provenance for the new asset.
    "imagery.readProvenance": null,
  });
  const cmp = await mount(<EditFlowStory assetId={sourceAssetId} chatId={chatId} url={PNG} />);

  const instruction = cmp.getByRole("textbox", { name: "Edit instruction" });
  await expect(instruction).toBeVisible();
  await instruction.fill("make it night");
  await cmp.getByRole("button", { name: "Generate edit" }).click();

  await expect.poll(() => rec.count("imagery.editImage")).toBe(1);
  // ONESHOT-OK: the preceding expect.poll(rec.count).toBe(1) barriers on the call being recorded, so this reads a settled input.
  expect(rec.lastInput("imagery.editImage")).toMatchObject({ sourceAssetId, instruction: "make it night", chatId });

  // Hand-off: the detail body appears on the edited asset (its Set-as-background action is the tell).
  await expect(cmp.getByRole("button", { name: "Set as background" })).toBeVisible();
});
