// @subject packages/client/src/features/refinery/components/context-tabs.tsx
// The Versions tab reads the snapshot walk through the shared boundary: a held read shows the loading skeleton, and a failed one the shared
// error block, never the "No versions yet" empty state that offers to mint a first snapshot. Retry shows the settled walk.

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { holdServed, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createSeededIds } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { VersionsTabStory } from "./_versions-stories.tsx";

const STORY = "tests/client/features/refinery/components/_versions-stories/VersionsTabStory";

test("a held snapshot walk shows the loading skeleton, a failed one the error block before the empty state, and Retry shows the walk", async ({
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const character = (await caller.character.list({})).items[0];
  if (character === undefined) {
    throw new Error("The corpus must contain a character");
  }
  const hold = holdServed();
  let held = false;
  let failing = true;
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings"]),
    ...serveCorpusProcedures(caller, ["character.listSnapshots"], () => {
      if (!held) {
        held = true;
        return hold;
      }
      return failing ? trpcError() : undefined;
    }),
  });
  await mount<typeof VersionsTabStory>(STORY, { characterId: character.id, sessionId: mintTypeId(ID_PREFIX.refinerySession, createSeededIds().next) });
  await hold.requested;
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  hold.fail();
  await expect(page.getByText("Couldn't load this card's versions.", { exact: true })).toBeVisible();
  await expect(page.getByText("No versions yet", { exact: true })).toHaveCount(0);
  failing = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Couldn't load this card's versions.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("No versions yet", { exact: true })).toBeVisible();
});
