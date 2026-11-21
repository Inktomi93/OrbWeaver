// A refused gallery add says so once, in the open picker, and keeps the images the person selected.
// @subject packages/client/src/features/chat/components/gallery-add-picker.tsx

import { createCharacterSchema } from "@orb/contracts/character";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { ALERTS_REGION_NAME, routeAuthConfig, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import {
  CHAT_GALLERY_ADD_NAME,
  CHAT_GALLERY_ADD_PICKER_TITLE,
  CHAT_GALLERY_ADD_SELECTED_NAME,
  CHAT_GALLERY_IMAGES_NAME,
  characterGalleryName,
} from "#client/features/chat/lib/chat-surface-names.ts";
import type { GalleryActionsStory } from "./_remaining-action-groups-stories.tsx";

const STORY = "tests/client/features/chat/components/_remaining-action-groups-stories/GalleryActionsStory";

test("a refused gallery add keeps the selected image in the open picker and says the refusal there", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "refused-gallery", name: "Refused gallery", description: "Gallery add refusal." }),
  });
  const chatId = (await caller.chat.startChat({ characterIds: [card.id], opening: "none" })).chat.id;
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me", "assets.listGallery", "assets.listOwned"]),
    ...serveCorpusProcedures(caller, ["assets.addToGallery"], () => trpcError()),
  });
  await corpusMedia();
  await mount<typeof GalleryActionsStory>(STORY, { characterId: card.id, characterName: card.name, chatId, appearance: appearanceSettingsSchema.parse({}) });

  await page.getByRole("button", { name: "Open character gallery", exact: true }).click();
  const gallery = page.getByRole("dialog", { name: characterGalleryName(card.name), exact: true });
  await gallery.getByRole("button", { name: CHAT_GALLERY_ADD_NAME, exact: true }).click();
  const picker = page.getByRole("dialog", { name: CHAT_GALLERY_ADD_PICKER_TITLE, exact: true });
  await picker.getByRole("grid", { name: CHAT_GALLERY_IMAGES_NAME, exact: true }).getByRole("gridcell").first().click();
  await expect(picker.getByText("1 selected", { exact: true })).toBeVisible();
  await picker.getByRole("button", { name: CHAT_GALLERY_ADD_SELECTED_NAME, exact: true }).click();

  await expect(picker.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("region", { name: ALERTS_REGION_NAME, exact: true }).getByRole("alert")).toHaveCount(0);
  await expect(picker.getByText("1 selected", { exact: true })).toBeVisible();
});
