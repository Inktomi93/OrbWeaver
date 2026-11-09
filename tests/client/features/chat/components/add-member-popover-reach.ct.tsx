// @subject packages/client/src/features/chat/components/add-member-popover.tsx
// The Add a character popover's list leaves the popup a strip the wheel can reach, so the footer under a full list stays reachable at enlarged text.

import { seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHAT_ADD_CHARACTER_NAME } from "#client/features/chat/lib/members-names.ts";
import { CLEAR_SEARCH_NAME } from "#client/lib/search-empty-names.ts";
import type { AddMemberPopoverStory } from "./_add-member-popover-stories.tsx";

const STORY = "tests/client/features/chat/components/_add-member-popover-stories/AddMemberPopoverStory";
const WHEEL_STEP_PX = 1600;
const REACH_PROBE_MS = 500;

test.describe("the Add a character popover on a 390 phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const factor of [2, 3]) {
    test(`at ${String(factor * 100)}% text the wheel carries the popover to its footer`, async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const host = await root.internalCallerFor(root.ownerId);
      const [room] = (await host.chat.listChats({ limit: 100 })).items;
      if (room === undefined) {
        throw new Error("The corpus has no room");
      }
      await seedShellState(page, { activeSection: "chats" });
      await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
      await routeTrpc(page, serveCorpusProcedures(host, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, "character.list"]));
      await mount<typeof AddMemberPopoverStory>(STORY, { chatId: room.id, existingCharacterIds: [] });
      await setRootFontScale(page, channelName("fontScale"), factor);
      await page.getByRole("button", { name: CHAT_ADD_CHARACTER_NAME, exact: true }).click();
      const popup = page.getByRole("dialog", { name: CHAT_ADD_CHARACTER_NAME, exact: true });
      // The footer shows once the search has a term.
      await popup.getByRole("combobox", { name: CHAT_ADD_CHARACTER_NAME, exact: true }).fill("a");
      const clear = popup.getByRole("button", { name: CLEAR_SEARCH_NAME, exact: true });
      await expect(clear).toBeVisible();
      const list = popup.locator('[data-slot="command-list"]');
      await expect(list.getByRole("option").first()).toBeVisible();
      const search = popup.getByRole("combobox", { name: CHAT_ADD_CHARACTER_NAME, exact: true });
      await expect(async () => {
        // The search field is the strip the list leaves: a wheel over it scrolls the popup, so the footer under a full list comes into reach.
        const box = await search.boundingBox();
        if (box === null) {
          throw new Error("The search field has no geometry");
        }
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, WHEEL_STEP_PX);
        await expect(clear).toBeInViewport({ ratio: 1, timeout: REACH_PROBE_MS });
      }).toPass();
      await clear.click({ trial: true });
    });
  }
});
