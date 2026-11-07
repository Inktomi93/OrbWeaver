// The Game tab's "Set character scores" lands on the sheet that holds the score controls, not on the roster one tap short of it.
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import type { RpgFollowedTabStory } from "./_own-key-panels-stories.tsx";

const STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgFollowedTabStory";

test("the score door opens the viewer's own sheet with the score controls on it", async ({ mount, page }) => {
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
      "rpg.getConfigView",
      "rpg.getTrackerView",
      "rpg.revealHidden",
      "preset.list",
      "plugin.listMacros",
    ]),
  );
  await mount<typeof RpgFollowedTabStory>(STORY, { chatId, from: "rpg.game" });
  await page.getByRole("button", { name: "Set character scores", exact: true }).click();
  await expect(page.getByRole("button", { name: "Roll 4d6 drop lowest", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use standard array", exact: true })).toBeVisible();
});
