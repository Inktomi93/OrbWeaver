import type { ConfigGroupId } from "@orb/client/state";
import { CONFIG_ADVANCED_FOLD_NAME, formatConfigLink } from "@orb/client/state";
import type { Page } from "@playwright/test";
import { waitForAppReady } from "./chat-room.ts";

/** Follow the same public deep link the native settings skimmer copies. */
export async function openConfigGroup(page: Page, group: ConfigGroupId): Promise<void> {
  await page.goto(formatConfigLink(group));
  await waitForAppReady(page);
}

/** Open the group's Advanced fold, where the expert tuning sections render; the reader's open answer persists. */
export async function openConfigAdvanced(page: Page): Promise<void> {
  const fold = page.getByRole("button", { name: CONFIG_ADVANCED_FOLD_NAME, exact: true });
  if ((await fold.getAttribute("aria-expanded")) !== "true") {
    await fold.click();
  }
}
