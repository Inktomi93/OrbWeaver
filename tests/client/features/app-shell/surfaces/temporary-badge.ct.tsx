// A temporary room says so in the shell topbar at every width: the wide header is the desktop's identity and the phone's narrow
// identity replaces it, so the mark stands beside both.
import { TEMPORARY_CHAT_BADGE } from "@orb/client/lib";
import { seedShellState } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { AppShellRoomStory } from "./_app-shell-stories.tsx";
import { PHONE, routeRoom, SHELL_STORIES } from "./app-shell-ct.ts";

const ROOM_STORY = `${SHELL_STORIES}/AppShellRoomStory`;
const DESKTOP = { width: 1440, height: 900 } as const;

for (const [name, viewport, touch] of [
  ["phone", PHONE, true],
  ["desktop", DESKTOP, false],
] as const) {
  test.describe(name, () => {
    test.use({ viewport, hasTouch: touch, isMobile: touch });

    test("a temporary room shows its badge once in the topbar", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const chatId = (await caller.chat.startChat({ characterIds: [], opening: "none", temporary: true })).chat.id;
      await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
      await routeRoom(page, corpus, caller);
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      await expect(page.locator(".shell-topbar").getByText(TEMPORARY_CHAT_BADGE, { exact: true })).toBeVisible();
    });
  });
}
