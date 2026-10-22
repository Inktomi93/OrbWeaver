// Room-entry reads must not remount the composer or lose input. Exercise raw typing and one-shot sending.
import { expect, test } from "@playwright/test";
import { openOrCreateChat, reopenFirstChat, typeAndSend, waitForAppReady } from "./support/chat-room.ts";
import { WAIT_SETTLE_MS } from "./support/timeouts.ts";

const INSTANT_MESSAGE = "Typing instantly on fast room entry should keep every character.";

test("typing instantly after room open keeps every keystroke — no composer remount, zero retries", { tag: "@live" }, async ({ page }) => {
  // Guarantee a committed chat exists (globalSetup seeds ≥1, but bootstrap it here if the DB is empty), then
  // RELOAD — the reload drops the in-memory query cache, so re-opening the chat enters the room with a COLD
  // `chat.listMessages` that must settle AFTER the room paints. That cold settle is the exact window the
  // buggy Suspense-boundary composer remounted in (a warm reuse never re-suspends, so a warm-cache open
  // would not exercise the bug at all — the reload is load-bearing).
  await openOrCreateChat(page);
  await page.reload();
  await waitForAppReady(page);
  await reopenFirstChat(page);
  const composer = page.getByRole("textbox", { name: "Message" });
  await expect(composer).toBeVisible();

  // (1) RAW instant type — NO settle wait, NO retry loop. Under the bug this dropped everything after the
  // first char when the room settled mid-type; with the stable composer the full value sticks and focus
  // is never lost.
  await composer.click();
  await composer.pressSequentially(INSTANT_MESSAGE, { delay: 15 });
  await expect(composer).toHaveValue(INSTANT_MESSAGE);
  await expect(composer).toBeFocused();

  await typeAndSend(composer, INSTANT_MESSAGE);

  // The send committed the user's row (chat.startChat/send) — assert the committed row, NOT any streamed
  // reply (no model wait). Resume-or-new may yield multiple user rows; assert the LAST (the one we sent).
  const userRow = page.locator('[data-slot="message-row"][data-role="user"]').last();
  await expect(userRow).toContainText("Typing instantly", { timeout: WAIT_SETTLE_MS });
});
