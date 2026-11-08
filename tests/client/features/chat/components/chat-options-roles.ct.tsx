// @subject packages/client/src/features/chat/components/chat-options-menu.tsx
// The room's Chat options offer a host Rename and Delete chat, and a member Leave chat in their place, because the
// server refuses a member the first two.

import { ROW_RENAME_NAME } from "@orb/client/lib";
import type { ChatId, UserId } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import { ROOM_PROCEDURES, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CHAT_DELETE_NAME, CHAT_LEAVE_CONFIRM_TITLE, CHAT_LEAVE_NAME, CHAT_SELECT_MESSAGES_NAME } from "#client/features/chat/lib/chat-options-names.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const CHAT_OPTIONS_NAME = "Chat options";
const SERVED = [
  ...SECTION_PROCEDURES,
  ...SHELL_MOUNT_PROCEDURES,
  ...ROOM_PROCEDURES,
  "notifications.presence",
  "invites.selfLeave",
  "rpg.getGame",
  "rpg.listTurnToolCalls",
] as const;
const ROLES = ["host", "member"] as const;

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

/** Serve the corpus room the owner hosts and the shared member sits in, as one of the two people in it. */
async function routeSharedRoomAs(
  role: (typeof ROLES)[number],
  root: ServerTestHarness,
  page: Page,
  corpus: CorpusPlayback,
): Promise<{ readonly chatId: ChatId; readonly memberId: UserId }> {
  const memberId = corpus.memberIdentities?.sharedMember.viewer.userId;
  const captured = corpus.reads["chat.getChat"].find(({ output }) => output.participants.some((person) => person.userId === memberId))?.output;
  if (captured === undefined || memberId === undefined) {
    throw new Error("The corpus has no shared human room");
  }
  await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  // The multi-user toggle is read when a caller is built, so the viewer's caller is made after it is set.
  const viewer = await root.internalCallerFor(role === "host" ? root.ownerId : memberId);
  await seedShellState(page, { activeSection: "chats" });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(viewer, SERVED));
  return { chatId: captured.id, memberId };
}

for (const role of ROLES) {
  test(`the ${role}'s Chat options offer ${role === "host" ? "Rename and Delete chat" : "Leave chat"}`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const { chatId } = await routeSharedRoomAs(role, root, page, corpus);
    await mount<typeof ChatRoomShellStory>(STORY, { chatId });
    await page.getByRole("button", { name: CHAT_OPTIONS_NAME, exact: true }).click();
    // Positive control: the menu is open and holds the actions both roles share.
    await expect(page.getByRole("menuitem", { name: CHAT_SELECT_MESSAGES_NAME, exact: true })).toBeVisible();
    const hostOnly = [ROW_RENAME_NAME, CHAT_DELETE_NAME];
    for (const name of hostOnly) {
      await expect(page.getByRole("menuitem", { name, exact: true })).toHaveCount(role === "host" ? 1 : 0);
    }
    await expect(page.getByRole("menuitem", { name: CHAT_LEAVE_NAME, exact: true })).toHaveCount(role === "host" ? 0 : 1);
  });
}

test("a member who confirms Leave chat from Chat options is out of the room", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const { chatId, memberId } = await routeSharedRoomAs("member", root, page, corpus);
  const host = await root.internalCallerFor(root.ownerId);
  expect((await host.chat.getChat({ chatId })).participants.some((person) => person.userId === memberId)).toBe(true);
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });
  await page.getByRole("button", { name: CHAT_OPTIONS_NAME, exact: true }).click();
  await page.getByRole("menuitem", { name: CHAT_LEAVE_NAME, exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: CHAT_LEAVE_CONFIRM_TITLE, exact: true });
  await confirm.getByRole("button", { name: "Leave", exact: true }).click();
  await expect.poll(async () => (await host.chat.getChat({ chatId })).participants.some((person) => person.userId === memberId)).toBe(false);
});
