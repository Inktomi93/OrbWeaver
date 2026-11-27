// @subject packages/client/src/features/plugin/components/plugin-distribute-section.tsx
// The published list names the admin who gave each plugin out and when it first went out. The corpus server already
// holds a published plugin, and the list is read from it, so the handle and the date are the server's own answer.

import { createTimeLib, UTC_TIME_ZONE } from "@orb/kit/time";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { nonEmpty } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { pluginPublishedLine } from "#client/features/plugin/lib/plugin-copy.ts";
import type { DistributeSectionStory } from "./_distribute-stories.tsx";

// The client's own timeLib reads browser storage this Node side lacks; the kit formatter it wraps renders the same words.
const STORY = "tests/client/features/plugin/components/_distribute-stories/DistributeSectionStory";

test("a published plugin's row says which admin published it and when", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const published = nonEmpty(await caller.plugin.listDistributed())[0];
  const publisher = await root.principalFor(root.ownerId);
  expect(published.distributedBy).toBe(publisher.handle);
  await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "plugin.listDistributed"]));
  await mount<typeof DistributeSectionStory>(STORY, {});

  await expect(
    page.getByText(pluginPublishedLine(published.distributedBy, createTimeLib({ timeZone: UTC_TIME_ZONE }).formatRelative(published.distributedAt))),
  ).toBeVisible();
});
