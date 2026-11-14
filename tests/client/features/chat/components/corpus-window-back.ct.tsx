// @subject packages/client/src/features/chat/components/transcript-window.tsx
// A room opened on a Corpus source moment carries a way back to Corpus in the toolbar above its rows.
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHAT_WINDOW_BACK_TO_CORPUS_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";

test("a source window offers the way back to Corpus beside its paging controls", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const [room] = (await caller.chat.listChats({})).items;
  if (room === undefined) {
    throw new Error("The corpus has no room to open a source window in");
  }
  const target = (await caller.chat.listMessages({ chatId: room.id })).messages[0];
  if (target === undefined) {
    throw new Error("The corpus room has no message to anchor a window on");
  }
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      ...SECTION_PROCEDURES,
      ...ROOM_PROCEDURES,
      "rpg.getGame",
      "rpg.listTurnToolCalls",
      "notifications.presence",
      "chat.listMessages",
      "chat.getMessageWindow",
    ]),
  });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id, moment: { kind: "message", messageId: target.id } });
  const back = page.getByRole("button", { name: CHAT_WINDOW_BACK_TO_CORPUS_NAME, exact: true });
  await expect(back).toBeVisible();
  await expect(back).toBeEnabled();
});
