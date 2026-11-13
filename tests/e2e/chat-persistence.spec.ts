// Durable chat metadata: real rename/star UI writes survive reload through native queries.
// Exact transcript identity and content are covered by scripted-chat.spec.ts.

import { CHAT_LIST_MAX_LIMIT } from "@orb/contracts/chat";
import { expect, test } from "@playwright/test";
import { chatRowActionsName } from "#client/features/chat/lib/chat-surface-names.ts";
import { ROW_STAR_NAME, ROW_UNSTAR_NAME } from "#client/lib/row-menu-names.ts";
import { openOrCreateChat, renameOpenChat, reopenFirstChat, waitForAppReady } from "./support/chat-room.ts";
import { runName } from "./support/run-names.ts";
import { NAME_HOLE, namePattern } from "./support/surface-walker.ts";
import { WAIT_SHORT_MS, WAIT_UI_MS } from "./support/timeouts.ts";
import { trpc } from "./support/trpc.ts";

/** Open the active row's actions kebab. The kebab is a sibling of the clickable row-body <button>,
 *  which overlaps it in stacking and intercepts pointer clicks — so open the menu via KEYBOARD (focus +
 *  Enter), which bypasses pointer interception entirely. */
async function openRowKebab(page: import("@playwright/test").Page): Promise<void> {
  const kebab = page.getByRole("button", { name: namePattern(chatRowActionsName(NAME_HOLE)) }).first();
  await expect(kebab).toBeVisible({ timeout: WAIT_UI_MS });
  await kebab.focus();
  await kebab.press("Enter");
}

test.describe("chat persistence", () => {
  test("rename → reload → re-open → title persists", async ({ page }) => {
    await openOrCreateChat(page);
    const newTitle = runName("e2e-rename");
    await renameOpenChat(page, newTitle);
    await expect(page.getByText(newTitle).first()).toBeVisible({ timeout: WAIT_SHORT_MS });

    await page.reload();
    await waitForAppReady(page);
    // The unique title survives in the refetched list (cache was gone) — unambiguous persistence proof.
    await expect(page.getByText(newTitle).first()).toBeVisible({ timeout: WAIT_UI_MS });
    await reopenFirstChat(page);
    await expect(page.getByText(newTitle).first()).toBeVisible({ timeout: WAIT_SHORT_MS });
  });

  test("star → reload → star state persists", async ({ page }) => {
    await openOrCreateChat(page);
    const title = runName("e2e-star");
    await renameOpenChat(page, title);
    const starredOnServer = async (): Promise<boolean> => {
      const room = (await trpc.chat.listChats.query({ search: title, includeArchived: true, limit: CHAT_LIST_MAX_LIMIT })).items.find(
        (item) => item.title === title,
      );
      if (room === undefined) {
        throw new Error("The renamed star subject is absent from the production chat list read");
      }
      return room.starred;
    };
    const wasStarred = await starredOnServer();
    // The item names the action a click takes, so the state the server holds picks which name the menu must offer.
    const toggleName = wasStarred ? ROW_UNSTAR_NAME : ROW_STAR_NAME;
    const inverseName = wasStarred ? ROW_STAR_NAME : ROW_UNSTAR_NAME;
    await openRowKebab(page);
    await page.getByRole("menuitem", { name: toggleName, exact: true }).click();
    await expect.poll(starredOnServer).toBe(!wasStarred);

    await page.reload();
    await waitForAppReady(page);
    await reopenFirstChat(page);
    await openRowKebab(page);
    const inverse = page.getByRole("menuitem", { name: inverseName, exact: true });
    await expect(inverse).toBeVisible({ timeout: WAIT_SHORT_MS });

    // Restore the original state so reruns start from the same server read.
    await inverse.click();
    await expect.poll(starredOnServer).toBe(wasStarred);
  });
});
