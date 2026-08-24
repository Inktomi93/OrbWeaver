// image-detail-body CT (interaction-direction-spec.md §7 B5) — the lightbox. The provenance strip shows
// readProvenance data; Set-as-background resolves the asset (assets.resolveBlobRefs) and writes the ONE
// applier (chat.setChatBackground) with the resolved hash/mime; Edit hands off to the edit body on the same
// asset (the mini-host swaps bodies off openModal).

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { DetailFlowStory } from "../_ct-stories.tsx";

// A 1×1 transparent PNG — an own-origin asset src the media primitive renders without a network fetch.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

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
