// @subject packages/client/src/features/rpg/components/rpg-journal-tab.tsx
// @subject packages/client/src/features/rpg/components/rpg-beat-row.tsx
// The host's chronicle says when older entries sit past the newest page and loads them on request, and a custom entry
// carries the label the host typed while any entry's type can be changed in place. The reads and writes go to a real
// game on a real server; only the transport between them is the test's.

import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import { JOURNAL_TYPE_LABELS } from "#client/features/rpg/lib/journal-labels.ts";
import {
  journalEntryLabelName,
  journalEntryTypeName,
  journalShownLine,
  RPG_JOURNAL_ADD_ENTRY_NAME,
  RPG_JOURNAL_LOAD_OLDER_NAME,
  RPG_JOURNAL_NEW_ENTRY_LABEL_NAME,
} from "#client/features/rpg/lib/rpg-names.ts";
import { trackerValueRestName } from "#client/features/rpg/lib/tracker-names.ts";
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
  "rpg.countJournal",
  "rpg.listCheckpoints",
  "rpg.addJournalEntry",
  "rpg.editJournalEntry",
] as const;
const NEWEST_PAGE = 100;
const ENTRIES = NEWEST_PAGE + 1;
const KIND = "Prophecy";
const TITLE = "Dawn";

test("a journal past one page says how many entries exist and loads the older ones on request", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const chatId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  await seedRpgGame(root, { principal: await root.principalFor(root.ownerId), chatId, mode: "lite", ruleset: "d20" });
  for (let n = 0; n < ENTRIES; n++) {
    await caller.rpg.addJournalEntry({ chatId, type: "note", title: `Entry ${String(n)}`, content: "" });
  }
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId, tab: "rpg.journal" });
  const journal = page.locator('[data-slot="rpg-journal-tab"]');

  await expect(journal.getByText(journalShownLine(NEWEST_PAGE, ENTRIES), { exact: true })).toBeVisible();
  // The entry written first is the one past the newest page.
  await expect(journal.getByText(`Entry ${String(ENTRIES - 1)}`, { exact: true })).toBeVisible();
  await expect(journal.getByText("Entry 0", { exact: true })).toHaveCount(0);

  await journal.getByRole("button", { name: RPG_JOURNAL_LOAD_OLDER_NAME, exact: true }).click();
  await expect(journal.getByText("Entry 0", { exact: true })).toBeVisible();
  await expect(journal.getByRole("button", { name: RPG_JOURNAL_LOAD_OLDER_NAME, exact: true })).toHaveCount(0);
  await expect(journal.getByText(journalShownLine(NEWEST_PAGE, ENTRIES), { exact: true })).toHaveCount(0);
});

test("a custom entry is born with the label the host typed, and its type changes in place", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const chatId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  await seedRpgGame(root, { principal: await root.principalFor(root.ownerId), chatId, mode: "lite", ruleset: "d20" });
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId, tab: "rpg.journal" });
  const journal = page.locator('[data-slot="rpg-journal-tab"]');

  await journal.getByRole("combobox", { name: "Entry type", exact: true }).click();
  await page.getByRole("option", { name: JOURNAL_TYPE_LABELS.custom, exact: true }).click();
  await journal.getByRole("textbox", { name: RPG_JOURNAL_NEW_ENTRY_LABEL_NAME, exact: true }).fill(KIND);
  await journal.getByRole("textbox", { name: "New entry title", exact: true }).fill(TITLE);
  await journal.getByRole("button", { name: RPG_JOURNAL_ADD_ENTRY_NAME, exact: true }).click();

  await expect(journal.getByRole("button", { name: trackerValueRestName(journalEntryLabelName(TITLE), KIND), exact: true })).toBeVisible();
  expect(await caller.rpg.listJournal({ chatId })).toMatchObject([{ type: "custom", label: KIND, title: TITLE }]);

  await journal.getByRole("combobox", { name: journalEntryTypeName(TITLE), exact: true }).click();
  await page.getByRole("option", { name: JOURNAL_TYPE_LABELS.note, exact: true }).click();
  await expect(journal.getByRole("button", { name: trackerValueRestName(journalEntryLabelName(TITLE), KIND), exact: true })).toHaveCount(0);
  expect(await caller.rpg.listJournal({ chatId })).toMatchObject([{ type: "note", label: "", title: TITLE }]);
});
