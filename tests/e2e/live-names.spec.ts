// E2E (@live): SPEAKER-NAME vs CHAT-TITLE honesty. Two distinct name systems must not bleed into each other:
//   • The per-row SPEAKER name (message-name-row) is DB-true: an assistant row shows the CHARACTER's name,
//     a user row shows the persona/user display name.
//   • The CHAT TITLE (topbar + list row) is a separate, renameable label. Renaming the chat must propagate
//     to the title everywhere but leave the row SPEAKER names untouched. A reload → all names still DB-true.
//
// @live: needs one real turn so a USER row and a generated ASSISTANT row both exist with resolved speaker
// names (a greeting seeds only an assistant row; there is no user row until a send). Skipped unless E2E_LIVE=1.
//
// THE ORACLE IS THE CATALOG, never the DOM: the spec mints its character, so the expected name is known before any
// row renders, and each row is read by its canon id. The name has more than one word so a speaker who merely shares
// a first word still fails the exact match. The user/persona display name is "You".

import type { CharacterHandle, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { messageRow, openNewestChat, renameOpenChat, reopenFirstChat, sendAndAwaitReply, waitForStreamOpen } from "./support/chat-room.ts";
import { frameCursor, tapStream } from "./support/stream-tap.ts";
import { CASE_LIVE_FOLLOW_UP_MS, WAIT_SHORT_MS, WAIT_SURFACE_MS } from "./support/timeouts.ts";
import { canonMessage, deleteChat, listCanon, mintFreshCharacter, removeCharacter, startChat } from "./support/trpc.ts";

const CHARACTER_NAME = "Namesake Alpha Probe";
const HANDLE = castId<CharacterHandle>("e2e-live-names");
const USER_DISPLAY_NAME = "You";

interface SpeakerRows {
  readonly greetingId: MessageId;
  readonly userId: MessageId;
  readonly assistantId: MessageId;
}

/** One row's visible speaker attribution, without its timestamp or actions. */
function attribution(page: Page, messageId: MessageId): Locator {
  return messageRow(page, messageId).locator('[data-slot="message-attribution"]').first();
}

async function expectSpeakerNames(page: Page, rows: SpeakerRows): Promise<void> {
  await expect(attribution(page, rows.greetingId)).toHaveText(CHARACTER_NAME);
  await expect(attribution(page, rows.assistantId)).toHaveText(CHARACTER_NAME);
  await expect(attribution(page, rows.userId)).toContainText(USER_DISPLAY_NAME);
}

test("row speaker names are DB-true and survive a chat rename + reload", {
  tag: "@live",
}, async ({ page }) => {
  test.setTimeout(CASE_LIVE_FOLLOW_UP_MS);

  // A spec-owned chat (greeting only), deleted in `finally`: a leaked chat stays newest in the shared DB and is what
  // the next spec's newest/first-chat helper would open.
  const characterId = await mintFreshCharacter(HANDLE, CHARACTER_NAME, "The namesake looks up.");
  const chatId = await startChat([characterId]);
  await tapStream(page);
  try {
    const since = frameCursor(page);
    await openNewestChat(page);
    await waitForStreamOpen(page, chatId, since);

    const greetingId = (await listCanon(chatId))[0]?.id;
    if (greetingId === undefined) {
      throw new Error("the minted character's chat seeded no greeting");
    }
    const { userId, assistantId } = await sendAndAwaitReply({ page, chatId }, "Reply with exactly: names-probe-ok");
    const rows = { greetingId, userId, assistantId };
    expect((await canonMessage(chatId, assistantId))?.characterId).toBe(characterId);

    // Speaker names: assistant rows show the CHARACTER, the user row shows the persona/user display name.
    await expectSpeakerNames(page, rows);

    // ── Rename the CHAT: the TITLE propagates, the row SPEAKER names do not change. ──
    const newTitle = `e2e-names-${Date.now()}`;
    await renameOpenChat(page, newTitle);
    await expect(page.getByText(newTitle).first()).toBeVisible({ timeout: WAIT_SHORT_MS });
    await expectSpeakerNames(page, rows);

    // ── Reload → re-open the row and re-read DB truth.
    await page.reload();
    await reopenFirstChat(page);
    await expect(page.getByText(newTitle).first()).toBeVisible({ timeout: WAIT_SURFACE_MS });
    await expectSpeakerNames(page, rows);
  } finally {
    await deleteChat(chatId);
    await removeCharacter(characterId);
  }
});
