// E2E: the chat LIST↔DB persistence layer (neo 07-chat-roundtrip port). Three proofs that UI writes survive
// a reload (the query layer refetches DB truth, no stashed React state):
//   1. open → reload → re-open reads the same chat + messages.
//   2. rename → reload → re-open → the new title persists.
//   3. star → reload → the star state persists.
//
// ORB STRUCTURAL DELTA vs neo (verified live): orb has NO `/chat/$id` route — the active chat is store-only
// client state, so `page.reload()` returns to the LANDING state, not the chat. Persistence is therefore
// asserted by RE-OPENING the chat from the (refetched) list after reload — the store cache is gone, so the
// re-open reads server truth. Selectors are role/text (orb has no neo chat testids): list rows are @orb/ui
// native <button>s; rename lives behind the ⋯ "Chat options" menu → a Dialog (wire `chat.updateTitle`);
// star lives in the per-ROW kebab "Chat actions" menu (wire `chat.star`). A unique minted title makes the
// list-vs-header title duplication unambiguous. Bootstrap: openOrCreateChat (support/chat-room.ts).

import { expect, test } from "@playwright/test";
import { openOrCreateChat, renameOpenChat, reopenFirstChat, waitForAppReady } from "./support/chat-room.ts";

const STAR_MENU_ITEM = /^(Star|Unstar)$/u;

/** The durable message-row count, once it has stopped changing (two equal consecutive polls) — filters out
 *  a transient streaming ghost row on a freshly-bootstrapped chat. */
async function stableRowCount(page: import("@playwright/test").Page): Promise<number> {
  const rows = page.locator('[data-slot="message-row"]');
  let last = -1;
  await expect
    .poll(
      async (): Promise<boolean> => {
        const n = await rows.count();
        const stable = n === last && n > 0;
        last = n;
        return stable;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return last;
}

/** Open the active row's "Chat actions" kebab. The kebab is a sibling of the clickable row-body <button>,
 *  which overlaps it in stacking and intercepts pointer clicks — so open the menu via KEYBOARD (focus +
 *  Enter), which bypasses pointer interception entirely. */
async function openRowKebab(page: import("@playwright/test").Page): Promise<void> {
  const kebab = page.getByRole("button", { name: "Chat actions" }).first();
  await expect(kebab).toBeVisible({ timeout: 10_000 });
  await kebab.focus();
  await kebab.press("Enter");
}

test.describe("chat persistence", () => {
  // `@smoke` — part of the fast pre-push anti-rot subset (`pnpm e2e:smoke`): drives the drift-prone
  // library→Chats-list reuse + reopen path (the exact selector surface this task's failures rotted on).
  test("open → reload → re-open reads the same DURABLE messages", { tag: "@smoke" }, async ({ page }) => {
    await openOrCreateChat(page);
    const rows = page.locator('[data-slot="message-row"]');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    // Let the room settle (a fresh bootstrap chat may still be streaming a turn — a transient ghost row
    // would inflate the count and race the reload). Wait app-ready (streams idle), then poll the count to
    // stability before capturing the DURABLE row count.
    await waitForAppReady(page);
    const before = await stableRowCount(page);
    expect(before).toBeGreaterThan(0);

    await page.reload();
    await waitForAppReady(page);
    // The store's active chat is gone on reload — re-open from the refetched list (proves the DB read).
    await reopenFirstChat(page);
    await waitForAppReady(page);
    // The same durable rows re-read from the server (web-first auto-retry to the stable count).
    await expect(rows).toHaveCount(before);
  });

  test("rename → reload → re-open → title persists", async ({ page }) => {
    await openOrCreateChat(page);
    const newTitle = `e2e-rename-${Date.now()}`;
    await renameOpenChat(page, newTitle);
    await expect(page.getByText(newTitle).first()).toBeVisible({ timeout: 5000 });

    await page.reload();
    await waitForAppReady(page);
    // The unique title survives in the refetched list (cache was gone) — unambiguous persistence proof.
    await expect(page.getByText(newTitle).first()).toBeVisible({ timeout: 10_000 });
    await reopenFirstChat(page);
    await expect(page.getByText(newTitle).first()).toBeVisible({ timeout: 5000 });
  });

  test("star → reload → star state persists", async ({ page }) => {
    await openOrCreateChat(page);
    await openRowKebab(page);
    // The menu item text reflects current state ("Star" when unstarred, "Unstar" when starred).
    const starItem = page.getByRole("menuitem", { name: STAR_MENU_ITEM });
    const wasStarred = (await starItem.textContent())?.trim() === "Unstar";
    const starResp = page.waitForResponse((r) => r.url().includes("/api/trpc/chat.star") && r.status() < 500);
    await starItem.click();
    await starResp;

    await page.reload();
    await waitForAppReady(page);
    await reopenFirstChat(page);
    // Re-open the kebab and assert the label flipped + persisted: unstarred→"Unstar", starred→"Star".
    await openRowKebab(page);
    const expectedLabel = wasStarred ? "Star" : "Unstar";
    await expect(page.getByRole("menuitem", { name: expectedLabel })).toBeVisible({
      timeout: 5000,
    });

    // Restore original state so reruns don't drift (register the response wait BEFORE the click).
    const restoreResp = page.waitForResponse((r) => r.url().includes("/api/trpc/chat.star") && r.status() < 500);
    await page.getByRole("menuitem", { name: expectedLabel }).click();
    await restoreResp;
  });
});
