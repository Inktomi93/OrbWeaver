// @subject packages/client/src/features/chat/surfaces/message-list-surface.tsx
// A room deleted where this client never heard of it leaves its id as the active chat. When the room's own read answers not found, the
// Chats section returns to its list instead of holding a dead room: a delete made from another session while this one sat on Home,
// and a stale id restored from storage at load.
import type { ChatId } from "@orb/kit/ids";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedActiveChat, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_LABELS, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { NO_CHAT_SELECTED_TITLE } from "#client/lib/chat-launch-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const ROOM_SURFACE = '[data-slot="chat-room-surface"]';
// A dead room's read is retried on the client's own schedule before it settles on the answer, so the landing arrives after it.
const RETRY_SETTLE_MS = 15_000;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

/** The production shell's reads answered by the root's owner, and the section it opens on. */
async function serveShell(
  root: Root,
  corpus: CorpusPlayback,
  page: Page,
  section: string,
): Promise<{ readonly caller: Awaited<ReturnType<Root["internalCallerFor"]>> }> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES]),
  });
  await seedShellState(page, { activeSection: section });
  return { caller };
}

async function ownerRoomId(caller: Awaited<ReturnType<Root["internalCallerFor"]>>): Promise<ChatId> {
  const [first] = (await caller.chat.listChats({})).items;
  if (first === undefined) {
    throw new Error("The committed corpus holds no owner room");
  }
  return first.id;
}

test("a restored room that still exists opens its room, not the chat list", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const { caller } = await serveShell(root, corpus, page, "chats");
  const live = await ownerRoomId(caller);
  await seedActiveChat(page, live);
  await mount<typeof ShellAmbientStory>(STORY, {});
  await expect(page.locator(ROOM_SURFACE)).toBeVisible();
  await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toHaveCount(0);
});

test("a stale room id restored at load lands on the chat list", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const { caller } = await serveShell(root, corpus, page, "chats");
  const gone = await ownerRoomId(caller);
  await caller.chat.delete({ chatId: gone });
  await seedActiveChat(page, gone);
  await mount<typeof ShellAmbientStory>(STORY, {});
  await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toBeVisible({ timeout: RETRY_SETTLE_MS });
  await expect(page.locator(ROOM_SURFACE)).toHaveCount(0);
});

test("a room deleted from another session while this one is on Home lands on the chat list when Chats opens", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const { caller } = await serveShell(root, corpus, page, "home");
  const gone = await ownerRoomId(caller);
  await seedActiveChat(page, gone);
  await mount<typeof ShellAmbientStory>(STORY, {});
  const rail = page.locator(".shell-rail");
  await expect(rail.getByRole("button", { name: SECTION_LABELS.chats, exact: true })).toBeVisible();
  await caller.chat.delete({ chatId: gone });
  await rail.getByRole("button", { name: SECTION_LABELS.chats, exact: true }).click();
  await expect(page.getByText(NO_CHAT_SELECTED_TITLE, { exact: true })).toBeVisible({ timeout: RETRY_SETTLE_MS });
  await expect(page.locator(ROOM_SURFACE)).toHaveCount(0);
});
