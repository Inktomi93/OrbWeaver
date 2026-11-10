// @subject packages/client/src/features/character/components/character-context-band.tsx
// The context band reads the card through the shared boundary: a held read shows the band's skeleton, a failed one the shared error block
// instead of a skeleton that never settles, and Retry shows the card's name.

import { heldThenFailing, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { queryFailedLabel } from "#client/data/query-state-copy.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { CharacterContextBandStory } from "./_context-band-stories.tsx";

const STORY = "tests/client/features/character/components/_context-band-stories/CharacterContextBandStory";
const FAILED = queryFailedLabel("this character");

test("a held card read shows the band skeleton, a failed one the error block, and Retry shows the card", async ({ mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const character = (await caller.character.list({})).items[0];
  if (character === undefined) {
    throw new Error("The corpus must contain a character");
  }
  const read = heldThenFailing();
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "chat.listChats"]),
    ...serveCorpusProcedures(caller, ["character.get"], read.intercept),
  });
  await mount<typeof CharacterContextBandStory>(STORY, { characterId: character.id });
  await read.hold.requested;
  await expect(page.locator('[data-slot="character-context-band-pending"]')).toBeVisible();
  read.hold.fail();
  await expect(page.getByText(FAILED, { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="character-context-band-pending"]')).toHaveCount(0);
  read.recover();
  await page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: character.name, exact: true })).toBeVisible();
  await expect(page.getByText(FAILED, { exact: true })).toHaveCount(0);
});
