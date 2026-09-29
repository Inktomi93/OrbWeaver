// CT: `/gallery` from the composer (`components/slash-gallery-mount.tsx`), through the chat feature's real door
// commands. The owner of the room's character opens that character's gallery (the store the app root's host
// reads; the story's probe prints it). A viewer who owns none is told why and nothing opens.

import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcFixtureOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CHAT_AMBIENT_ROUTES, CHAT_ROOM_ROUTES, COMPOSER_CHAT_ID } from "../fixtures.ts";
import { ChatDoorSlashComposerStory } from "../hooks/_slash-command-stories.tsx";

const NO_GALLERY_HERE = "You own no character in this chat, so it has no gallery of yours to open.";

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

  test(`${viewport.name}: /gallery is offered disabled with its reason to a viewer who owns no character here`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const trpc = await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...CHAT_ROOM_ROUTES,
      "chat.getChat": galleryRoom(false),
      "chat.send": () => ({ messages: [], aborted: false }),
    });
    const component = await mount(<ChatDoorSlashComposerStory />);
    const textarea = component.getByLabel("Message", { exact: true });

    await textarea.fill("/gal");
    const offer = component.getByRole("option", { name: /\/gallery/u });
    await expect(offer).toBeDisabled();
    await expect(offer).toContainText(NO_GALLERY_HERE);

    await textarea.fill("/gallery");
    await component.getByRole("button", { name: "Send message" }).click();
    await expect(component.getByRole("alert")).toHaveText(NO_GALLERY_HERE);
    await expect(component.getByTestId("composer-gallery-target")).toHaveText("");
    // The refusal came from the strip before any runner could toast, and it has rendered.
    await expect(component.getByTestId("composer-notified")).toHaveText("");
    await expect.poll(() => trpc.count("chat.send")).toBe(0);
  });

  test(`${viewport.name}: /gallery opens the gallery in a room with no connection, where only a message is refused`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const trpc = await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...CHAT_ROOM_ROUTES,
      "chat.getChat": galleryRoom(true),
      "chat.checkSendAvailability": () => ({ available: false, cause: "no-connection" }),
      "chat.send": () => ({ messages: [], aborted: false }),
    });
    const component = await mount(<ChatDoorSlashComposerStory />);
    const textarea = component.getByLabel("Message", { exact: true });
    await expect.poll(() => trpc.count("chat.checkSendAvailability"), { intervals: [20, 50, 100] }).toBeGreaterThan(0);

    await textarea.fill("hello");
    const send = component.getByRole("button", { name: "Send message" });
    await expect(send).toHaveAttribute("aria-disabled", "true");
    await textarea.fill("/gallery");
    await expect(send).not.toHaveAttribute("aria-disabled", "true");
    await send.click();

    await expect(component.getByTestId("composer-gallery-target")).toHaveText(`character_ct_aria|Aria|${COMPOSER_CHAT_ID}`);
    await expect.poll(() => trpc.count("chat.send")).toBe(0);
  });
}
