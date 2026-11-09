// New chat's title and its saved-roster door at enlarged text. The dialog's inline margin is held to a twentieth of the screen, so a short wide screen
// at 300% keeps the room for the whole title beside Close, and the door stays whole above the dialog's edge.

import { pressableWhole, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHAT_SAVED_ROSTER_DOOR_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { AppShellModalStory } from "./_app-shell-stories.tsx";
import { SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellModalStory`;

const CELLS = [
  { name: "568x320 landscape phone at 300%", width: 568, height: 320, touch: true, factor: 3 },
  { name: "1440x900 desktop at 300%", width: 1440, height: 900, touch: false, factor: 3 },
] as const;

for (const cell of CELLS) {
  test.describe(`New chat on a ${cell.name}`, () => {
    test.use({ viewport: { width: cell.width, height: cell.height }, hasTouch: cell.touch, isMobile: cell.touch });

    test("holds its whole title beside Close and keeps the saved-roster door whole", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
      await seedShellState(page, { activeSection: "chats" });
      await mount<typeof AppShellModalStory>(STORY, { modalId: "newChat" });
      const dialog = page.getByRole("dialog");
      await setRootFontScale(page, channelName("fontScale"), cell.factor);
      await expect(dialog.getByRole("option").first()).toBeVisible();
      const title = dialog.getByRole("heading").first();
      await expect.poll(() => title.evaluate((node) => node.scrollWidth - node.clientWidth), "the title is not cut to an ellipsis").toBeLessThanOrEqual(0);
      await expect.poll(() => pressableWhole(dialog.getByRole("button", { name: DIALOG_VERBS.close, exact: true }))).toBe(true);
      const door = dialog.getByRole("button", { name: CHAT_SAVED_ROSTER_DOOR_NAME, exact: true }).filter({ visible: true });
      // Scrolled to as a reader reaches it: a centring scroll would park it under the sticky header.
      await door.evaluate((node) => node.scrollIntoView({ block: "end" }));
      await expect.poll(() => pressableWhole(door)).toBe(true);
    });
  });
}
