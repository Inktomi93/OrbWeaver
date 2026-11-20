// @subject packages/client/src/features/rpg/components/rpg-journal-tab.tsx
// @subject packages/client/src/features/rpg/components/rpg-quests-tab.tsx
// A game with no chronicle and no quests shows the shared empty state on the Journal and Quests tabs, and the host's composer sits
// in its action slot, so the first entry is one press from the empty pane.

import type { ChatId } from "@orb/kit/ids";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import {
  RPG_JOURNAL_ADD_ENTRY_NAME,
  RPG_JOURNAL_EMPTY_DESCRIPTION,
  RPG_JOURNAL_EMPTY_TITLE,
  RPG_NEW_QUEST_NAME,
  RPG_QUESTS_EMPTY_DESCRIPTION,
  RPG_QUESTS_EMPTY_TITLE,
} from "#client/features/rpg/lib/rpg-names.ts";
import type { RpgContextTabStory } from "./_own-key-panels-stories.tsx";

const TAB_STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgContextTabStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "chat.getChat",
  "chat.listMessages",
  "rpg.getGame",
  "rpg.getTrackerView",
  "rpg.revealHidden",
  "rpg.listJournal",
  "rpg.listCheckpoints",
] as const;
test.use({ hasTouch: false, isMobile: false });

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

/** A lite game in a fresh room: no journal entries and no quests. */
async function seedEmptyGame(root: Root): Promise<ChatId> {
  const caller = await root.internalCallerFor(root.ownerId);
  const principal = await root.principalFor(root.ownerId);
  const chatId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  await seedRpgGame(root, { principal, chatId, mode: "lite", ruleset: "d20" });
  return chatId;
}

test("the host's empty Journal is the shared empty state with the composer as its action", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const chatId = await seedEmptyGame(root);
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), READS));
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId, tab: "rpg.journal" });
  const empty = page.locator('[data-slot="rpg-journal-tab"] [data-slot="empty-state-root"]');
  await expect(empty.locator('[data-slot="empty-state-title"]')).toHaveText(RPG_JOURNAL_EMPTY_TITLE);
  await expect(empty.locator('[data-slot="empty-state-description"]')).toHaveText(RPG_JOURNAL_EMPTY_DESCRIPTION.host);
  await expect(empty.locator('[data-slot="empty-state-action"]').getByRole("button", { name: RPG_JOURNAL_ADD_ENTRY_NAME, exact: true })).toBeVisible();
});

test("the host's empty Quests tab is the shared empty state with New quest as its action", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const chatId = await seedEmptyGame(root);
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), READS));
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId, tab: "rpg.quests" });
  const empty = page.locator('[data-slot="rpg-quests-tab"] [data-slot="empty-state-root"]');
  await expect(empty.locator('[data-slot="empty-state-title"]')).toHaveText(RPG_QUESTS_EMPTY_TITLE);
  await expect(empty.locator('[data-slot="empty-state-description"]')).toHaveText(RPG_QUESTS_EMPTY_DESCRIPTION.host);
  await expect(empty.locator('[data-slot="empty-state-action"]').getByRole("button", { name: RPG_NEW_QUEST_NAME, exact: true })).toBeVisible();
});
