// @subject packages/client/src/features/rpg/components/rpg-journal-tab.tsx
// The Journal's Cards scope reads the transcript through the shared boundary: a held read shows the loading skeleton, a failed one
// the shared error block, and Retry shows the archive. The All chronicle never waits on, or blanks for, the transcript.

import { holdServed, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import type { RpgContextTabStory } from "./_own-key-panels-stories.tsx";

const TAB_STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgContextTabStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "chat.getChat",
  "rpg.getGame",
  "rpg.getTrackerView",
  "rpg.revealHidden",
  "rpg.listJournal",
  "rpg.listCheckpoints",
] as const;
const ARCHIVE_ERROR = "Couldn't load the card archive.";

test("a failed transcript read leaves the All chronicle standing, and the Cards scope shows the shared states", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const principal = await root.principalFor(root.ownerId);
  const chatId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  await seedRpgGame(root, { principal, chatId, mode: "lite", ruleset: "d20" });
  const hold = holdServed();
  let phase: "fail" | "hold" | "serve" = "fail";
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["chat.listMessages"], () => {
      if (phase === "fail") {
        return trpcError({ code: "BAD_REQUEST" });
      }
      if (phase !== "hold") {
        return;
      }
      phase = "serve";
      return hold;
    }),
  });
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId, tab: "rpg.journal" });
  const journal = page.locator('[data-slot="rpg-journal-tab"]');
  // All: the chronicle and the host's composer render while the transcript fails, and no archive error stands in for them.
  await expect(journal.getByText(/Nothing chronicled yet/u)).toBeVisible();
  await expect(journal.getByRole("button", { name: "Add entry", exact: true })).toBeVisible();
  await expect(journal.getByText(ARCHIVE_ERROR, { exact: true })).toHaveCount(0);
  await journal.getByRole("button", { name: "Cards", exact: true }).click();
  await expect(journal.getByText(ARCHIVE_ERROR, { exact: true })).toBeVisible();
  phase = "hold";
  await journal.getByRole("button", { name: "Retry", exact: true }).click();
  await hold.requested;
  await expect(journal.locator('[aria-busy="true"]')).toBeVisible();
  await expect(journal.getByRole("button", { name: "Marks", exact: true })).toBeVisible();
  hold.release();
  await expect(journal.getByText(/No cards yet/u)).toBeVisible();
  await expect(journal.getByText(ARCHIVE_ERROR, { exact: true })).toHaveCount(0);
});
