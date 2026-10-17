import type { ConfigGroupId } from "@orb/client/state";
import { formatConfigLink } from "@orb/client/state";
import type { Page } from "@playwright/test";
import { waitForAppReady } from "./chat-room.ts";

/** Follow the same public deep link the native settings skimmer copies. */
export async function openConfigGroup(page: Page, group: ConfigGroupId): Promise<void> {
  await page.goto(formatConfigLink(group));
  await waitForAppReady(page);
}
