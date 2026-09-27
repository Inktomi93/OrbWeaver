// CT: the app root's gallery host (`anchors/character-gallery-host.tsx`). Any surface opens the gallery through
// `openCharacterGallery`; the host shows that one dialog. From inside a chat the "This chat" scope is there;
// from outside any chat it is absent and the read names no room. Closing clears the store, so it can reopen.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CharacterGalleryHostStory } from "../_ct-stories.tsx";
import { GALLERY_CELL, ITEM } from "../_gallery-fixtures.ts";

for (const viewport of [
  { name: "mobile", width: 360, height: 780 },
  { name: "desktop", width: 1440, height: 900 },
] as const) {
  test(`${viewport.name}: opened outside a chat, the gallery has no "This chat" scope and reads the whole gallery`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const trpc = await routeTrpc(page, { "assets.listGallery": () => [ITEM] });
    await mount(<CharacterGalleryHostStory />);

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByTestId("ct-open-gallery-outside").click();
    const dialog = page.getByRole("dialog", { name: "Aria's gallery" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("gridcell", { name: GALLERY_CELL })).toHaveCount(1);
    await expect(dialog.getByRole("radiogroup", { name: "Order" })).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole("radiogroup", { name: "Show images from" })).toHaveCount(0);
    await expect
      .poll(() => trpc.lastInput("assets.listGallery"))
      .toEqual({ subjectCharacterId: "character_ct_gallery", limit: 100, sort: "newest", direction: "forward" });

    // Closing clears the store: the dialog leaves, and the same door opens it again.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByTestId("ct-open-gallery-outside").click();
    await expect(page.getByRole("dialog", { name: "Aria's gallery" })).toBeVisible();
  });

  test(`${viewport.name}: opened from a chat, the gallery offers "This chat" and reads that room`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const trpc = await routeTrpc(page, { "assets.listGallery": () => [ITEM] });
    await mount(<CharacterGalleryHostStory />);

    await page.getByTestId("ct-open-gallery-in-chat").click();
    const scope = page.getByRole("dialog", { name: "Aria's gallery" }).getByRole("radiogroup", { name: "Show images from" });
    await expect(scope).toBeInViewport({ ratio: 1 });
    await scope.getByRole("radio", { name: "This chat" }).click();
    await expect
      .poll(() => trpc.lastInput("assets.listGallery"))
      .toEqual({ subjectCharacterId: "character_ct_gallery", chatId: "chat_ct_keystone", limit: 100, sort: "newest", direction: "forward" });
  });
}
