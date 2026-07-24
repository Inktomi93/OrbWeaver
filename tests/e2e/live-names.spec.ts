// E2E (@live): SPEAKER-NAME vs CHAT-TITLE honesty. Two distinct name systems must not bleed into each other:
//   • The per-row SPEAKER name (message-name-row) is DB-true: an assistant row shows the CHARACTER's name,
//     a user row shows the persona/user display name.
//   • The CHAT TITLE (topbar + list row) is a separate, renameable label. Renaming the chat must propagate
//     to the title everywhere but leave the row SPEAKER names untouched. A reload → all names still DB-true.
//
// @live: needs one real turn so a USER row and a generated ASSISTANT row both exist with resolved speaker
// names (globalSetup's greeting seeds only an assistant row; there is no user row until a send). Skipped
// unless E2E_LIVE=1. Self-seeding via globalSetup's committed chat.
//
// Discovered pins (live 2026-07-24): the seeded character speaker name is "JFC"; the user/persona display
// name is "You". The name-row also carries a timestamp line, so we assert the name is CONTAINED, not equal.

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { openNewestChat, renameOpenChat, reopenFirstChat, typeAndSend, waitForStreamOpen } from "./support/chat-room";
import { listCharacters, startChat } from "./support/trpc";

const USER_DISPLAY_NAME = "You";
const NON_WS = /\S/u;

/** The trimmed name text of the first row of the given role (name-row = speaker name + timestamp). */
async function speakerNameText(page: Page, role: "user" | "assistant"): Promise<string> {
  const row = page.locator(`[data-slot="message-row"][data-role="${role}"]`).first();
  return (await row.locator('[data-slot="message-name-row"]').first().innerText()).replace(/\s+/gu, " ").trim();
}

test("row speaker names are DB-true and survive a chat rename + reload", {
  tag: "@live",
}, async ({ page }) => {
  test.setTimeout(180_000);

  // SELF-SEED a fresh chat (greeting only) and open it in the UI (newest → first row). Avoids growing a
  // shared chat across runs and keeps the transcript short (top rows always rendered).
  const characterId = (await listCharacters())[0]?.id ?? "";
  expect(characterId).not.toBe("");
  await startChat([characterId]);
  await openNewestChat(page);
  await waitForStreamOpen(page);

  // The committed chat opens with a character; capture its speaker name from the seeded assistant greeting
  // row (present before any turn). This is the CHARACTER name the assistant rows must show.
  const characterName = (await speakerNameText(page, "assistant")).split(" ")[0] ?? "";
  expect(characterName).toMatch(NON_WS);

  // Drive one turn so a USER row exists too (greeting seeds only an assistant row).
  await typeAndSend(page.getByRole("textbox", { name: "Message" }), "Reply with exactly: names-probe-ok");
  await expect(page.locator('[data-slot="message-row"][data-role="user"]').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-slot="message-row"][data-role="assistant"]').last()).toContainText(NON_WS, { timeout: 120_000 });

  // Speaker names: assistant row shows the CHARACTER, user row shows the persona/user display name.
  expect(await speakerNameText(page, "assistant")).toContain(characterName);
  expect(await speakerNameText(page, "user")).toContain(USER_DISPLAY_NAME);

  // ── Rename the CHAT: the TITLE propagates, the row SPEAKER names do not change. ──
  const newTitle = `e2e-names-${Date.now()}`;
  await renameOpenChat(page, newTitle);
  await expect(page.getByText(newTitle).first()).toBeVisible({ timeout: 5000 });

  // Title changed; speaker names unaffected.
  expect(await speakerNameText(page, "assistant")).toContain(characterName);
  expect(await speakerNameText(page, "user")).toContain(USER_DISPLAY_NAME);

  // ── Reload → the store-only active chat drops to the landing state; re-open the row and re-read DB truth.
  await page.reload();
  await reopenFirstChat(page);
  // The renamed title persisted (DB truth) and the speaker names are still DB-true.
  await expect(page.getByText(newTitle).first()).toBeVisible({ timeout: 15_000 });
  expect(await speakerNameText(page, "assistant")).toContain(characterName);
  expect(await speakerNameText(page, "user")).toContain(USER_DISPLAY_NAME);
});
