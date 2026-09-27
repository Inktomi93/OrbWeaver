// CT: `/gallery` from the composer (`components/slash-gallery-mount.tsx`), through the chat feature's real door
// commands. The owner of the room's character opens that character's gallery (the store the app root's host
// reads; the story's probe prints it). A viewer who owns none is told why and nothing opens.

import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcFixtureOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CHAT_AMBIENT_ROUTES, CHAT_ROOM_ROUTES, COMPOSER_CHAT_ID } from "../fixtures.ts";
import { ChatDoorSlashComposerStory } from "../hooks/_slash-command-stories.tsx";

function galleryRoom(viewerOwnsAria: boolean): TrpcFixtureOutput<"chat.getChat"> {
  return {
    ...CHAT_ROOM_ROUTES["chat.getChat"],
    participants: [
      { id: "chat_participant_ct_aria", kind: "character", userId: null, characterId: "character_ct_aria", role: "member", displayName: "Aria", leftSeq: null },
    ],
    viewerGalleryCharacterId: viewerOwnsAria ? "character_ct_aria" : null,
  };
}

for (const viewport of [
  { name: "mobile", width: 360, height: 780 },
  { name: "desktop", width: 1440, height: 900 },
] as const) {
  test(`${viewport.name}: /gallery opens the gallery of the room character the viewer owns, and posts nothing`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const trpc = await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...CHAT_ROOM_ROUTES,
      "chat.getChat": galleryRoom(true),
      "chat.send": () => ({ messages: [], aborted: false }),
    });
    const component = await mount(<ChatDoorSlashComposerStory />);

    await component.getByLabel("Message", { exact: true }).fill("/gallery");
    await component.getByRole("button", { name: "Send message" }).click();

    await expect(component.getByTestId("composer-gallery-target")).toHaveText(`character_ct_aria|Aria|${COMPOSER_CHAT_ID}`);
    await expect.poll(() => trpc.count("chat.send")).toBe(0);
  });

  test(`${viewport.name}: /gallery tells a viewer who owns no character here why nothing opens`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const trpc = await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...CHAT_ROOM_ROUTES,
      "chat.getChat": galleryRoom(false),
      "chat.send": () => ({ messages: [], aborted: false }),
    });
    const component = await mount(<ChatDoorSlashComposerStory />);

    await component.getByLabel("Message", { exact: true }).fill("/gallery");
    await component.getByRole("button", { name: "Send message" }).click();

    await expect(component.getByTestId("composer-notified")).toContainText("You own no character in this chat, so it has no gallery of yours to open.");
    await expect(component.getByTestId("composer-gallery-target")).toHaveText("");
    await expect.poll(() => trpc.count("chat.send")).toBe(0);
  });
}
