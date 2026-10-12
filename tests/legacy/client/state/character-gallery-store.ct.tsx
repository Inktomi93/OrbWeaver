// character-gallery store CT: the intent store the app-root gallery anchor reads. Any surface opens a gallery
// through `openCharacterGallery`, so no feature imports the chat feature that owns the dialog. A CT because the
// read is the reactive hook. Proves an open from a room keeps its chat (the "This chat" scope), an open outside
// a room names none, a re-open replaces the target instead of inheriting a stale chat, and close clears it.

import { expect, test } from "@playwright/experimental-ct-react";
import { CharacterGalleryProbe } from "./_ct-stories.tsx";

test("open names the gallery and its room, a re-open outside a room drops the chat, and close clears it", async ({ mount }) => {
  const probe = await mount(<CharacterGalleryProbe />);
  const state = probe.locator("output");
  await expect(state).toHaveText("closed");

  await probe.getByRole("button", { name: "open in room" }).click();
  await expect(state).toHaveText("char_probe_aria Aria chat_probe_select");

  await probe.getByRole("button", { name: "open outside" }).click();
  await expect(state).toHaveText("char_probe_aria Aria no-chat");

  await probe.getByRole("button", { name: "close" }).click();
  await expect(state).toHaveText("closed");
});
