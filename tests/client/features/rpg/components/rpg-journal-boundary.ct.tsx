// @subject packages/client/src/features/rpg/components/rpg-journal-tab.tsx
// The Journal tab's card projection reads the transcript through the shared boundary: a held read shows the loading skeleton, a failed
// one the shared error block, and Retry shows the chronicle.

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

test("a held transcript read shows the loading skeleton in the Journal, a failed one the error block, and Retry shows the chronicle", async ({
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const principal = await root.principalFor(root.ownerId);
  const chatId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  await seedRpgGame(root, { principal, chatId, mode: "lite", ruleset: "d20" });
  const hold = holdServed();
  let held = false;
  let failing = true;
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["chat.listMessages"], () => {
      if (!held) {
        held = true;
        return hold;
      }
      return failing ? trpcError() : undefined;
    }),
  });
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId, tab: "rpg.journal" });
  const journal = page.locator('[data-slot="rpg-journal-tab"]');
  await hold.requested;
  await expect(journal.locator('[aria-busy="true"]')).toBeVisible();
  // The scope row is read-independent and stays standing.
  await expect(journal.getByRole("button", { name: "Marks", exact: true })).toBeVisible();
  hold.fail();
  await expect(journal.getByText("Couldn't load the card archive.", { exact: true })).toBeVisible();
  failing = false;
  await journal.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(journal.getByText("Couldn't load the card archive.", { exact: true })).toHaveCount(0);
  await expect(journal.getByText(/Nothing chronicled yet/u)).toBeVisible();
});
