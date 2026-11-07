// The Status card's text starts on one edge: a meter's name sits where the status line and the condition door do.
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import type { RpgContextTabStory } from "./_own-key-panels-stories.tsx";

const TAB_STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgContextTabStory";
const EDGE_TOLERANCE_PX = 1;

/** Where the first glyph of the locator's text starts, not where its box does. */
function glyphStart(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode();
    if (text === null) {
      throw new Error("the element has no text");
    }
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 1);
    return range.getBoundingClientRect().left;
  });
}

test("a meter's name starts on the edge the status line and the condition door start on", async ({ mount, page }) => {
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
  const card = page.locator('[data-slot="rpg-status-tab"]');
  const meterName = card.locator('[data-slot="meter-row"]').first().locator('[data-slot="text"]').first();
  await expect(meterName).toBeVisible();
  const status = card.getByText("Add status", { exact: true }).first();
  const condition = card.getByText("+ condition", { exact: true }).first();
  const name = await glyphStart(meterName);
  expect(Math.abs(name - (await glyphStart(status)))).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
  expect(Math.abs(name - (await glyphStart(condition)))).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
});
