// @subject packages/client/src/features/refinery/components/context-tabs.tsx
// The Versions tab reads the snapshot walk through the shared boundary: a held read shows the loading skeleton, and a failed one the shared
// error block, never the "No versions yet" empty state that offers to mint a first snapshot. Retry shows the settled walk. A compared
// snapshot reads through its own boundary inside the row, with the same held, failed and retried states.

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { heldThenFailing, holdServed, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createSeededIds } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { queryFailedLabel } from "#client/data/query-state-copy.ts";
import {
  REFINERY_NO_VERSIONS_TITLE,
  REFINERY_READ_LABELS,
  REFINERY_VERSION_LOADING_TEXT,
  refineryCompareToggleName,
} from "#client/features/refinery/lib/refinery-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
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
  await expect(page.getByText(queryFailedLabel(REFINERY_READ_LABELS.versions), { exact: true })).toBeVisible();
  await expect(page.getByText(REFINERY_NO_VERSIONS_TITLE, { exact: true })).toHaveCount(0);
  failing = false;
  await page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(page.getByText(queryFailedLabel(REFINERY_READ_LABELS.versions), { exact: true })).toHaveCount(0);
  await expect(page.getByText(REFINERY_NO_VERSIONS_TITLE, { exact: true })).toBeVisible();
});

test("a held snapshot compare shows its loading line, a failed one the error block, and Retry shows the diff", async ({ mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const character = (await caller.character.list({})).items[0];
  if (character === undefined) {
    throw new Error("The corpus must contain a character");
  }
  const { id: snapshotId } = await caller.character.snapshot({ characterId: character.id, label: "manual: before refining" });
  const description = (await caller.character.getSnapshot({ characterId: character.id, snapshotId })).content.description ?? "";
  if (description === "") {
    throw new Error("The compared snapshot needs a description to diff");
  }
  const read = heldThenFailing();
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "character.listSnapshots"]),
    ...serveCorpusProcedures(caller, ["character.getSnapshot"], read.intercept),
  });
  await mount<typeof VersionsTabStory>(STORY, { characterId: character.id, sessionId: mintTypeId(ID_PREFIX.refinerySession, createSeededIds().next) });
  await page.getByRole("button", { name: refineryCompareToggleName(false), exact: true }).click();
  await read.hold.requested;
  await expect(page.getByText(REFINERY_VERSION_LOADING_TEXT, { exact: true })).toBeVisible();
  read.hold.fail();
  await expect(page.getByText(queryFailedLabel(REFINERY_READ_LABELS.version), { exact: true })).toBeVisible();
  // The failure stays inside the compared row: the walk and its toggle stand.
  await expect(page.getByRole("button", { name: refineryCompareToggleName(true), exact: true })).toBeVisible();
  read.recover();
  await page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(page.getByText(queryFailedLabel(REFINERY_READ_LABELS.version), { exact: true })).toHaveCount(0);
  // Against an empty live description every word of the snapshot reads as removed.
  await expect(page.locator('pre:has([data-diff="removed"])')).toHaveJSProperty("textContent", description);
});
