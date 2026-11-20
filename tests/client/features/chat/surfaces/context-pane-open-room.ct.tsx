// @subject packages/client/src/features/chat/lib/chats-section.tsx
// @subject packages/client/src/features/chat/hooks/use-chat-context-state.ts
// The Chats details pane says it has no chat only while no room is open. A room opened from the Chats list, a plain one or a game
// one, fills the docked pane with its own tabs or its game rail, and the no-room copy is gone.

import { GAME_STRIP_LABEL } from "@orb/client/lib";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { CHAT_CONTEXT_EMPTY, CHAT_CONTEXT_TABLIST_NAME } from "#client/features/chat/lib/chat-context-tab-labels.ts";
import { CHAT_LIST_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { deriveChatTitle } from "#client/lib/chat-title.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const GAME_ROOM_TITLE = "The lantern campaign";
const SERVED = [
  ...SECTION_PROCEDURES,
  ...ROOM_PROCEDURES,
  "rpg.getGame",
  "rpg.listTurnToolCalls",
  "rpg.getTrackerView",
  "rpg.getConfigView",
  "rpg.listJournal",
  "rpg.revealHidden",
] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

/** Mount the shell on the Chats section with the list and the details pane both docked, over what `root` holds. */
async function mountChatsWithDetails(root: Root, corpus: CorpusPlayback, page: Page, mountShell: () => Promise<unknown>): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SERVED) });
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "docked" } } });
  await mountShell();
}

function listRowTitled(page: Page, title: string): Locator {
  return page.getByLabel(CHAT_LIST_NAME, { exact: true }).getByText(title, { exact: true }).first();
}

test("the details pane says no chat is open until a room is opened from the list, then carries the room's tabs", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const [newest] = (await caller.chat.listChats({})).items;
  if (newest === undefined) {
    throw new Error("The committed corpus holds no owner room");
  }
  await mountChatsWithDetails(root, corpus, page, () => mount<typeof ShellAmbientStory>(STORY, {}));
  // The control for the absence below: with nothing open the pane does say so.
  await expect(page.getByText(CHAT_CONTEXT_EMPTY.title, { exact: true })).toBeVisible();
  await listRowTitled(page, deriveChatTitle(newest.title, newest.participantNames)).click();
  await expect(page.getByRole("tablist", { name: CHAT_CONTEXT_TABLIST_NAME, exact: true })).toBeVisible();
  await expect(page.getByText(CHAT_CONTEXT_EMPTY.title, { exact: true })).toHaveCount(0);
});

test("a game room opened from the list fills the details pane with its game rail, not the no-chat copy", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const game = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat;
  await caller.chat.updateTitle({ chatId: game.id, title: GAME_ROOM_TITLE });
  await seedRpgGame(root, { principal: await root.principalFor(root.ownerId), chatId: game.id, mode: "lite", ruleset: "d20" });
  await mountChatsWithDetails(root, corpus, page, () => mount<typeof ShellAmbientStory>(STORY, {}));
  await expect(page.getByText(CHAT_CONTEXT_EMPTY.title, { exact: true })).toBeVisible();
  await listRowTitled(page, GAME_ROOM_TITLE).click();
  await expect(page.getByRole("toolbar", { name: GAME_STRIP_LABEL, exact: true })).toBeVisible();
  await expect(page.getByText(CHAT_CONTEXT_EMPTY.title, { exact: true })).toHaveCount(0);
});
