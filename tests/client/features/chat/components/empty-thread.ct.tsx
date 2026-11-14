// @subject packages/client/src/features/chat/surfaces/message-list-surface.tsx
// A room whose opening policy seeded no message shows the shared empty state in place of its transcript, and the composer under it
// stays the way on.

import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHAT_EMPTY_THREAD_TITLE, CHAT_MESSAGE_INPUT_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

test("an empty room shows the shared empty state with the composer still offered", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const chatId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  await seedShellState(page, { activeSection: "chats" });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "rpg.getGame", "rpg.listTurnToolCalls"]),
  });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });
  // Other panes of the shell may draw their own empty state, so the one asked about is the one that holds this title.
  const empty = page
    .locator('[data-slot="empty-state-root"]')
    .filter({ has: page.locator('[data-slot="empty-state-title"]', { hasText: CHAT_EMPTY_THREAD_TITLE }) });
  await expect(empty).toBeVisible();
  await expect(page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true })).toBeVisible();
});
