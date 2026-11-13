// The Game tab's "Set character scores" lands on the sheet that holds the score controls, not on the roster one tap short of it.
import { contextToggleLabel } from "@orb/client/lib";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import { RPG_CONTEXT_TAB_LABELS, RPG_ROLL_SCORES_NAME, RPG_SET_SCORES_NAME, RPG_STANDARD_ARRAY_NAME } from "#client/features/rpg/lib/rpg-names.ts";
import type { RpgRoomStory } from "./_own-key-panels-stories.tsx";

const STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgRoomStory";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test("the score door opens the viewer's own sheet with the score controls on it", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const principal = await root.principalFor(root.ownerId);
  const chatId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  await seedRpgGame(root, { principal, chatId, mode: "lite", ruleset: "d20" });
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      ...SECTION_PROCEDURES,
      ...ROOM_PROCEDURES,
      "rpg.getGame",
      "rpg.getConfigView",
      "rpg.getTrackerView",
      "rpg.revealHidden",
      "rpg.listTurnToolCalls",
    ]),
  });
  await mount<typeof RpgRoomStory>(STORY, { chatId });
  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  await page.getByRole("tab", { name: RPG_CONTEXT_TAB_LABELS.game, exact: true }).click();
  await page.getByRole("button", { name: RPG_SET_SCORES_NAME, exact: true }).click();
  await expect(page.getByRole("button", { name: RPG_ROLL_SCORES_NAME, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: RPG_STANDARD_ARRAY_NAME, exact: true })).toBeVisible();
});
