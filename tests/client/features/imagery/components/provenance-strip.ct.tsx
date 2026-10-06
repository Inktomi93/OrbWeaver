import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { RestoredDetailStory } from "../_ct-stories.tsx";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("an imagery-only restore completion replaces cached NULL with same-asset provenance", async ({ mount, page }) => {
  const assetId = mintTypeId(ID_PREFIX.asset);
  const generationId = mintTypeId(ID_PREFIX.imageryGeneration);
  const state: { restored: boolean } = { restored: false };
  const routes = await routeTrpc(page, {
    "imagery.readProvenance": () =>
      state.restored
        ? {
            generationId,
            assetId,
            mode: "free",
            prompt: "The restored blue bird",
            negativePrompt: null,
            model: "historical-image-model",
            costUsd: 0.125,
            subjectCharacterId: null,
            identityHash: null,
            edited: false,
            createdAt: 1_750_000_000_000,
            usage: {
              servedModel: null,
              tokensIn: null,
              tokensOut: null,
              reasoningTokens: null,
              cacheReadTokens: null,
              cacheWriteTokens: null,
              costProvenance: null,
              costDetails: null,
              tokenDetails: null,
            },
          }
        : null,
  });
  const component = await mount(<RestoredDetailStory assetId={assetId} chatId={mintTypeId(ID_PREFIX.chat)} url={PNG} />);
  await expect(component.getByRole("button", { name: "Set as background" })).toBeVisible();
  await expect.poll(() => routes.count("imagery.readProvenance")).toBe(1);
  state.restored = true;
  await component.getByRole("button", { name: "Restore completed" }).click();
  await expect(component.getByText("The restored blue bird")).toBeVisible();
  await expect(component.getByText("historical-image-model")).toBeVisible();
  await expect.poll(() => routes.count("imagery.readProvenance")).toBe(2);
});
