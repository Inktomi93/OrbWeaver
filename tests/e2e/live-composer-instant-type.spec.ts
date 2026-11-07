// Room-entry reads must not remount the composer or lose input. Exercise raw typing and one-shot sending.
import { expect, test } from "@playwright/test";
import { CHAT_MESSAGE_INPUT_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { messageRow, openNewestChat, reopenFirstChat, sendAndAwaitReply, waitForAppReady } from "./support/chat-room.ts";
import { WAIT_SETTLE_MS } from "./support/timeouts.ts";
import { deleteChat, listCharacters, startChat } from "./support/trpc.ts";

const INSTANT_MESSAGE = "Typing instantly on fast room entry should keep every character.";

test("typing instantly after room open keeps every keystroke — no composer remount, zero retries", { tag: "@live" }, async ({ page }) => {
  // A self-seeded room, so the send has a known chat, then RELOAD — the reload drops the in-memory query cache, so
  // re-opening the chat enters the room with a COLD `chat.listMessages` that must settle AFTER the room paints. That
  // cold settle is the window in which a Suspense-boundary composer would remount; a warm-cache open never re-suspends.
  const character = (await listCharacters())[0];
  if (character === undefined) {
    throw new Error("globalSetup seeds at least one character");
  }
  const chatId = await startChat([character.id]);
  await openNewestChat(page);
  await page.reload();
  await waitForAppReady(page);
  await reopenFirstChat(page);
  const composer = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME });
  await expect(composer).toBeVisible();

  try {
    // RAW instant type — NO settle wait, NO retry loop. A remounting composer would drop everything after the first
    // character; with the stable composer the full value sticks and focus is never lost.
    await composer.click();
    await composer.pressSequentially(INSTANT_MESSAGE, { delay: 15 });
    await expect(composer).toHaveValue(INSTANT_MESSAGE);
    await expect(composer).toBeFocused();

    // Wait for the reply as well: deleting a room mid-turn would race its last writes.
    const { userId } = await sendAndAwaitReply({ page, chatId }, INSTANT_MESSAGE);
    await expect(messageRow(page, userId)).toContainText(INSTANT_MESSAGE, { timeout: WAIT_SETTLE_MS });
  } finally {
    await deleteChat(chatId);
  }
});
