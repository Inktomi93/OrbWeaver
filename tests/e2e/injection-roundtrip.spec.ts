// E2E: chat-injection DB roundtrip (neo 10-injection-roundtrip port) — the CONTEXT panel's Injections
// surface is a loud write-path (ad-hoc positional context spliced into a chat's prompt). This drives it
// end-to-end:
//   1. open a chat, open the CONTEXT panel's "This chat" tab and scroll to its Injections section.
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
import { openContextSections } from "../support/node/open-context-sections.ts";
import { openContextTab, openDetailPanel, openOrCreateChat, reopenFirstChat, waitForAppReady } from "./support/chat-room.ts";

/** From an open chat, reach the Injections editor. IA UPDATE (panel-redesign consolidation): the ⋯ menu's
 *  "Injections…" jump and the standalone Injections meta-tab are BOTH gone — an option with a context-panel
 *  home does not belong in the three dots, so Injections is now a section of the ONE "This chat" tab
 *  (settings-context-tab.tsx). Same editor, same verbs; only the navigation changed.
 *
 *  AND THAT SECTION IS A CLOSED DISCLOSURE (#830, `195085e2c`) — the tab opens as an INDEX and a closed Base
 *  UI panel is REMOVED from the DOM, so "Add injection" does not exist until the kicker is pressed
 *  (measured: 0 collapsed / 1 expanded). This helper asserted the button straight after the tab click and so
 *  failed with `element(s) not found` from the day the index landed (#1851). The kicker carries a live count
 *  chip ("Injections 2"), which is why the walker matches by PREFIX. */
async function openInjectionsTab(page: Page): Promise<void> {
  await openDetailPanel(page);
  await openContextTab(page, "This chat");
  await openContextSections(page, "Injections");
  await expect(page.getByRole("button", { name: "Add injection" })).toBeVisible({
    timeout: 10_000,
  });
}

/** Every injection ROW is itself a collapse-until-needed disclosure (#821, injections-manager.tsx): the
 *  trigger carries `Injection <n>` plus the summary, the editor lives in the panel, and a row whose content
 *  is non-empty renders CLOSED — so its Content textarea and its Remove button are not in the DOM at all.
 *  Only a blank row opens itself, which is why the just-added row was reachable while every reloaded row was
 *  not. Expanding is also the product's own confirmation gesture for Remove, so this walk is the real user
 *  path and not a test-only door. Idempotent, by `aria-expanded`, in DOM order. */
async function expandInjectionRows(page: Page): Promise<void> {
  const triggers = page.getByRole("button", { name: /^Injection \d+/u });
  for (let i = 0; i < (await triggers.count()); i += 1) {
    const trigger = triggers.nth(i);
    if ((await trigger.getAttribute("aria-expanded")) !== "true") {
      await trigger.click();
    }
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  }
}

/** The live VALUES of every Content textarea in the Injections tab (controlled inputs — read the value via
 *  Playwright's `inputValue`, since a textarea's live value is NOT its DOM text). Playwright locators are
 *  used instead of a `page.evaluate` DOM walk because the e2e tsconfig is DOM-less (tsconfig.json).
 *
 *  EXPANDS FIRST: an unexpanded row contributes NO textarea, so this read used to report `[]` for a room
 *  holding three persisted injections — an empty array that reads exactly like "the write never landed". */
async function contentValues(page: Page): Promise<readonly string[]> {
  await expandInjectionRows(page);
  const fields = page.getByRole("textbox", { name: "Content" });
  const count = await fields.count();
  return Promise.all(Array.from({ length: count }, (_, i) => fields.nth(i).inputValue()));
}

test("injection: add → reload persists; remove → reload gone", async ({ page }) => {
  // THE 60s PROJECT DEFAULT IS NOT THIS TEST'S BUDGET, AND NOBODY HAD EVER FOUND OUT (#1851). Until the
  // disclosure walk above was fixed this test died at second ~10 on a missing "Add injection" button, so its
  // real cost had never been paid once. It is a THREE-RELOAD roundtrip: the room bootstrap (which may drive
  // one real start-chat turn), then add → reload → re-open → read, remove → reload → re-open → read. Measured
  // from the traces of the first two full runs: ~10s per reload to `data-app-ready`, ~6s per landing
  // navigation, ~5s to walk back into the chat and open the section — ~25-30s per verification leg on top of
  // the bootstrap. The budget ran out mid-leg, and Playwright reports that as whatever action was in flight
  // (a `locator.click` that "hung", an app-ready wait that never resolved) — two different-looking failures,
  // one cause. `members-tab-views.local.spec.ts` declares 180s for the same reason; this one reloads more.
  test.setTimeout(240_000);
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
  // 15s, not 5s: `contentValues` now WALKS the per-row disclosures before it can read anything, so the first
  // poll iteration costs a press per persisted row on top of the suspended `chat.listChatInjections` read.
  await expect.poll(async (): Promise<readonly string[]> => contentValues(page), { timeout: 15_000 }).toContain(marker);

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
  await expect.poll(async (): Promise<readonly string[]> => contentValues(page), { timeout: 15_000 }).not.toContain(marker);
});
