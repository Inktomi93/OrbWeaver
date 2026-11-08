// Blank chat is the way to start a room without a character, so it sits in the pinned action row beside Start and is on screen the moment New chat opens,
// at any text size: nothing in the dialog has to scroll for a user to find it.

import { BLANK_CHAT_NAME } from "@orb/client/lib";
import { seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { AppShellModalStory } from "./_app-shell-stories.tsx";
import { SHELL_STORIES } from "./app-shell-ct.ts";

const CELLS = [
  { name: "phone at 100%", width: 390, height: 844, touch: true, factor: 1 },
  { name: "phone at 300%", width: 390, height: 844, touch: true, factor: 3 },
  { name: "desktop at 100%", width: 1440, height: 900, touch: false, factor: 1 },
  { name: "desktop at 300%", width: 1440, height: 900, touch: false, factor: 3 },
] as const;

for (const cell of CELLS) {
  test.describe(`New chat on a ${cell.name}`, () => {
    test.use({ viewport: { width: cell.width, height: cell.height }, hasTouch: cell.touch, isMobile: cell.touch });

    test("shows Blank chat in the pinned action row without scrolling", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
      await seedShellState(page, { activeSection: "chats" });
      await mount<typeof AppShellModalStory>(`${SHELL_STORIES}/AppShellModalStory`, { modalId: "newChat" });
      const dialog = page.getByRole("dialog");
      await setRootFontScale(page, channelName("fontScale"), cell.factor);
      await expect(dialog.getByRole("option").first()).toBeVisible();
      const blank = dialog.locator('[data-slot="new-chat-actions"]').getByRole("button", { name: BLANK_CHAT_NAME, exact: true });
      await expect(blank).toBeInViewport({ ratio: 1 });
    });
  });
}
