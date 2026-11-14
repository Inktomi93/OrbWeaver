// @subject packages/client/src/features/rpg/components/rpg-character-detail.tsx
// The character takeover's breadcrumb is the one way back to the participant list.
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import { RPG_CHARACTER_BACK_NAME } from "#client/features/rpg/lib/rpg-names.ts";
import type { RpgContextTabStory } from "./_own-key-panels-stories.tsx";

const TAB_STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgContextTabStory";

test("a character's takeover returns to the participant list through its breadcrumb", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const principal = await root.principalFor(root.ownerId);
  const chatId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  await seedRpgGame(root, { principal, chatId, mode: "lite", ruleset: "d20" });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "chat.getChat",
      "chat.listMessages",
      "rpg.getGame",
      "rpg.getTrackerView",
      "rpg.revealHidden",
    ]),
  );
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId, tab: "rpg.status" });
  const list = page.locator('[data-slot="rpg-status-tab"]');
  const takeover = page.locator('[data-slot="rpg-character-detail"]');
  await list
    .locator('[data-slot="rpg-status-card"]')
    .first()
    .getByRole("button", { name: /^Open /u })
    .click();
  const back = takeover.getByRole("button", { name: RPG_CHARACTER_BACK_NAME, exact: true });
  await expect(back).toBeVisible();
  await back.click();
  await expect(takeover).toHaveCount(0);
  await expect(list).toBeVisible();
});
