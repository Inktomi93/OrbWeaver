// E2E (#13): the anti-regression pin for "the composer eats keystrokes on fast room entry". The bug the
// e2e lane found live: typing IMMEDIATELY after opening a room registered only the FIRST character — the
// composer re-mounted (dropping focus + the controlled value) when the room's initial `chat.listMessages`
// read settled or an SSE event landed mid-type ("Reply…" left the textarea at just "R"). The shared
// `typeAndSend` helper worked around it with a retry poll, which CONCEALED the defect. The fix
// (chat-room-surface.tsx `ComposerSlot`) reads the composer's tail via a NON-suspending gated query so the
// <Composer> is ONE stable element across the settle — no Suspense fallback→child swap, no remount.
//
// This spec proves instant typing survives room entry WITHOUT the retry crutch, two ways:
//   (1) a RAW pressSequentially (no settle wait, no retry) lands the FULL text — the direct user symptom;
//   (2) the shared `typeAndSend` needs ZERO retries (its exposed ledger) — the belt never had to catch.
//
// NO MODEL: the assertion is the composed COMPOSER value + a send, never a streamed reply — the send fires
// but the spec asserts only that the user's row committed (chat.startChat/send), not any generation. It is
// tagged `@live` because it needs the REAL running stack (a committed chat + the live room settle timing
// the CT can only simulate), but it spends no meaningful model time (the send is not awaited for a reply).
// Run against the already-running stack (reuses it — do NOT use the CT config):
//   E2E_LIVE=1 npx playwright test -c playwright.config.ts live-composer-instant-type

import { expect, test } from "@playwright/test";
import { openOrCreateChat, reopenFirstChat, takeTypeAndSendRetries, typeAndSend, waitForAppReady } from "./support/chat-room.ts";

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

  // Clear it — the actual send below rides the retry-ledger path so we can pin zero retries. (Clearing
  // here keeps the send content deterministic regardless of the raw type above.)
  await composer.press("ControlOrMeta+A");
  await composer.press("Delete");

  // (2) Send through the shared helper and assert its retry ledger stayed at ZERO — the belt never had to
  // catch a remount. A resurfaced remount would push this above zero even though the poll would still
  // eventually pass, so this is the true anti-regression signal.
  takeTypeAndSendRetries(); // scope the ledger to this call
  await typeAndSend(composer, INSTANT_MESSAGE);
  expect(takeTypeAndSendRetries()).toBe(0);

  // The send committed the user's row (chat.startChat/send) — assert the committed row, NOT any streamed
  // reply (no model wait). Resume-or-new may yield multiple user rows; assert the LAST (the one we sent).
  const userRow = page.locator('[data-slot="message-row"][data-role="user"]').last();
  await expect(userRow).toContainText("Typing instantly", { timeout: 30_000 });
});
