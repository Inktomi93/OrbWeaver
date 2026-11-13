// @subject packages/client/src/features/rpg/components/tracker-blocks/tracker-value.tsx
// An empty tracker value shows its placeholder ("Add status") on the rest button, so the button's name carries those words.
import { accessibilityScan } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import { RPG_STATUS_LINE_LABEL, RPG_STATUS_PLACEHOLDER } from "#client/features/rpg/lib/rpg-names.ts";
import type { RpgContextTabStory } from "./_own-key-panels-stories.tsx";

const TAB_STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgContextTabStory";
const LABEL_MISMATCH = "label-content-name-mismatch";
const REST_SLOT = 'data-slot="tracker-value-rest"';

test("the empty status line's button name contains its visible placeholder", async ({ mount, page }) => {
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
  const status = card.locator(`[${REST_SLOT}]`).filter({ hasText: RPG_STATUS_PLACEHOLDER }).first();
  await expect(status).toBeVisible();
  const name = await status.evaluate((button) => button.getAttribute("aria-label"));
  expect(name).toContain(RPG_STATUS_LINE_LABEL);
  expect(name).toContain(RPG_STATUS_PLACEHOLDER);
  const result = await accessibilityScan(page);
  const mismatched = result.violations.find(({ id }) => id === LABEL_MISMATCH)?.nodes ?? [];
  expect(mismatched.filter(({ html }) => html.includes(REST_SLOT))).toEqual([]);
});
