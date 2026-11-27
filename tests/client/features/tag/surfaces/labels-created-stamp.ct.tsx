// @subject packages/client/src/features/tag/components/tag-collection-rows.tsx
// A tag row in the Labels finder says when the tag was made.
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CREATED_STAMP_LEAD } from "#client/lib/stamp-copy.ts";
import type { LabelsListStory } from "./_labels-list-stories.tsx";

const STORY = "tests/client/features/tag/surfaces/_labels-list-stories/LabelsListStory";
const PROCEDURES = ["sessions.me", "settings.getUserSettings", "tag.listTagsWithUsage", "tag.listPendingSuggestions"] as const;

test.use({ viewport: { width: 1440, height: 900 } });

test("every tag row in the Labels finder says when the tag was made", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const [tag] = await caller.tag.listTagsWithUsage();
  if (tag === undefined) {
    throw new Error("The corpus must hold a tag");
  }
  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
  await mount<typeof LabelsListStory>(STORY, {});
  const rows = page.locator('[data-slot="list-row-root"]');
  await expect(rows.first()).toBeVisible();
  const shown = await rows.count();
  expect(shown).toBeGreaterThan(0);
  await expect(rows.filter({ hasText: CREATED_STAMP_LEAD })).toHaveCount(shown);
});
