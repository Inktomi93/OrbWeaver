// image-edit-body CT (interaction-direction-spec.md §7 B5) — img2img. An instruction drives
// imagery.editImage with the source asset + instruction; on success the modal hands off to the detail body on
// the freshly-edited asset (proven by the detail body's Set-as-background action appearing).

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { EditFlowStory } from "../_ct-stories.tsx";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

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
