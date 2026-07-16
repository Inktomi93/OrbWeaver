// E2E: chat-injection DB roundtrip (neo 10-injection-roundtrip port) — the CONTEXT panel's Injections tab
// is a loud write-path (ad-hoc positional context spliced into a chat's prompt). This drives it end-to-end:
//   1. open a chat, jump to the Injections tab (via the ⋯ "Injections…" option → docks the context panel).
//   2. Add an injection, set its Content to a unique marker (autosave persists it — chat.setChatInjection).
//   3. reload → the row persists (read from the DB).
//   4. Remove the row (chat.deleteChatInjection).
//   5. reload → gone.
//
// Orb differs from neo structurally (verified against injections-manager.tsx): there is NO slot field and
// NO explicit Save button — an injection is position/role/depth/content, "Add injection" IMMEDIATELY
// persists a blank row (chat.setChatInjection), and each field AUTOSAVES on blur. There is no soft-disable;
// "off" = delete. The only free-text identifier is Content, so a unique marker in Content tracks the row
// across reloads. A textarea's live value is NOT its DOM text, so marker-presence is checked by reading the
// Content field VALUES in-page (evaluate), and delete targets the Section whose Content holds the marker.

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { openChatOptions, openOrCreateChat, reopenFirstChat, waitForAppReady } from "./support/chat-room";

/** From an open chat, jump to the docked Injections tab (chat-options-menu.tsx "Injections…" seam). */
async function openInjectionsTab(page: Page): Promise<void> {
  await openChatOptions(page);
  await page.getByRole("menuitem", { name: "Injections…" }).click();
  await expect(page.getByRole("button", { name: "Add injection" })).toBeVisible({
    timeout: 10_000,
  });
}

/** The live VALUES of every Content textarea in the Injections tab (controlled inputs — read the value via
 *  Playwright's `inputValue`, since a textarea's live value is NOT its DOM text). Playwright locators are
 *  used instead of a `page.evaluate` DOM walk because the e2e tsconfig is DOM-less (tsconfig.json). */
async function contentValues(page: Page): Promise<readonly string[]> {
  const fields = page.getByRole("textbox", { name: "Content" });
  const count = await fields.count();
  return Promise.all(Array.from({ length: count }, (_, i) => fields.nth(i).inputValue()));
}

test("injection: add → reload persists; remove → reload gone", async ({ page }) => {
  await openOrCreateChat(page);
  await openInjectionsTab(page);

  const marker = `e2e-inj-${Date.now()}`;

  // ── Add: "Add injection" persists a blank row immediately; a new Content textarea appears. ──
  const addResp = page.waitForResponse((r) => r.url().includes("/api/trpc/chat.setChatInjection") && r.status() < 500);
  await page.getByRole("button", { name: "Add injection" }).click();
  await addResp;

  // Type the marker into the new (last) Content field and blur to trigger the autosave write.
  const content = page.getByRole("textbox", { name: "Content" }).last();
  await expect(content).toBeVisible({ timeout: 5000 });
  const saveResp = page.waitForResponse((r) => r.url().includes("/api/trpc/chat.setChatInjection") && r.status() < 500);
  await content.fill(marker);
  await content.blur();
  await saveResp;

  // ── Reload — the marker must come from the DB now. Reload boots to LANDING (orb has no chat URL), so
  //    re-open the chat from the list before reaching its Injections tab. ──
  await page.reload();
  await waitForAppReady(page);
  await reopenFirstChat(page);
  await openInjectionsTab(page);
  await expect.poll(async (): Promise<readonly string[]> => contentValues(page), { timeout: 5000 }).toContain(marker);

  // ── Remove: delete the row whose Content == marker. Content fields + "Remove injection" buttons share
  //    DOM order (one per Section), so the marker's index in the values maps to its Remove button. This is
  //    precise even when prior rows exist (accumulated from earlier runs). ──
  const values = await contentValues(page);
  const markerIndex = values.indexOf(marker);
  expect(markerIndex).toBeGreaterThanOrEqual(0);
  const delResp = page.waitForResponse((r) => r.url().includes("/api/trpc/chat.deleteChatInjection") && r.status() < 500);
  await page.getByRole("button", { name: "Remove injection" }).nth(markerIndex).click();
  await delResp;

  // ── Reload — still gone (re-open the chat from the list first). ──
  await page.reload();
  await waitForAppReady(page);
  await reopenFirstChat(page);
  await openInjectionsTab(page);
  await expect.poll(async (): Promise<readonly string[]> => contentValues(page), { timeout: 5000 }).not.toContain(marker);
});
