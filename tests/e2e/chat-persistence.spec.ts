// Durable chat metadata: real rename/star UI writes survive reload through native queries.
// Exact transcript identity and content are covered by scripted-chat.spec.ts.
import { expect, test } from "@playwright/test";
import { openOrCreateChat, renameOpenChat, reopenFirstChat, waitForAppReady } from "./support/chat-room.ts";

const STAR_MENU_ITEM = /^(Star|Unstar)$/u;

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
